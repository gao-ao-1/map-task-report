export const statuses = ["待启动", "编写中", "审核中", "已完成", "已暂停"];
export function nameKey(name: string) {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}
export function reportInput(
  input: Record<string, unknown>,
  regions: {
    adcode: number;
    name: string;
    level: string;
    parent: number | null;
  }[],
) {
  const value: Record<string, string> = {};
  for (const field of [
    "name",
    "county",
    "client",
    "contact",
    "phone",
    "owner",
    "status",
    "due",
    "type",
    "notes",
  ]) {
    if (typeof input[field] !== "string") throw new Error("请完整填写报告信息");
    value[field] = (input[field] as string).trim();
    if (value[field].length > (field === "notes" ? 3000 : 200))
      throw new Error("输入内容过长");
  }
  if (!value.name || !value.client || !value.owner)
    throw new Error("报告名称、甲方和负责人不能为空");
  const county = regions.find(
    (r) =>
      String(r.adcode) === value.county &&
      (r.level === "district" ||
        (r.level === "city" &&
          !regions.some((child) => child.parent === r.adcode))),
  );
  if (!county) throw new Error("请选择有效的县、区或县级市");
  if (!statuses.includes(value.status)) throw new Error("任务状态无效");
  if (
    value.due &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(value.due) ||
      Number.isNaN(Date.parse(value.due)) ||
      new Date(value.due).toISOString().slice(0, 10) !== value.due)
  )
    throw new Error("日期无效");
  return { ...value, county_name: county.name, name_key: nameKey(value.name) };
}
export function checkFile(filename: string, bytes: Uint8Array) {
  const ext = filename.toLowerCase().split(".").pop();
  const starts = (signature: number[]) =>
    signature.every((b, i) => bytes[i] === b);
  if (ext === "pdf" && starts([37, 80, 68, 70, 45])) return "application/pdf";
  if (ext === "doc" && starts([208, 207, 17, 224, 161, 177, 26, 225]))
    return "application/msword";
  if (ext === "docx" && starts([80, 75, 3, 4])) {
    const decoded = new TextDecoder().decode(bytes);
    if (
      decoded.includes("[Content_Types].xml") &&
      decoded.includes("word/document.xml")
    )
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  throw new Error("仅支持内容与扩展名匹配的 Word（doc/docx）或 PDF 文件");
}
