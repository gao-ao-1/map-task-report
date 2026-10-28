import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { reportInput, checkFile } from "../../../lib/domain";
import regions from "../../../lib/regions.json";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
class Failure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function handle(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) throw new Failure(401, "请先登录后查看团队报告");
    const db = env.DB,
      bucket = env.BUCKET;
    if (!db || !bucket) throw new Failure(503, "数据服务尚未配置");
    const email = user.email.trim().toLowerCase(),
      now = new Date().toISOString();
    const path = new URL(request.url).pathname
        .split("/")
        .filter(Boolean)
        .slice(1),
      method = request.method;
    // The Site is owner-private at creation. Its owner's first authenticated visit initializes membership atomically.
    await db
      .prepare(
        "INSERT INTO members(email,role,created_at) SELECT ?,'admin',? WHERE NOT EXISTS(SELECT 1 FROM members)",
      )
      .bind(email, now)
      .run();
    const member = await db
      .prepare("SELECT * FROM members WHERE email=?")
      .bind(email)
      .first<{ email: string; role: string }>();
    if (!member)
      throw new Failure(403, "你的账号尚未加入团队，请管理员添加你的登录邮箱");
    const admin = member.role === "admin";
    const contentType = request.headers.get("content-type") || "";
    let input: Record<string, unknown> = {},
      uploadForm: FormData | null = null;
    if (method !== "GET" && contentType.includes("application/json")) {
      if (Number(request.headers.get("content-length")) > 16384)
        throw new Failure(413, "请求内容过长");
      input = (await request.json()) as Record<string, unknown>;
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Failure(400, "请求内容格式错误");
    }
    if (method === "POST" && path[2] === "files") {
      if (Number(request.headers.get("content-length")) > 22 * 1024 * 1024)
        throw new Failure(413, "单个附件最大 20 MB");
      uploadForm = await request.formData();
    }
    if (method !== "GET") {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin)
        throw new Failure(403, "请求来源不匹配");
    }
    if (path[0] === "me" && method === "GET")
      return json({ ...user, email, role: member.role });
    if (path[0] === "members") {
      if (!admin) throw new Failure(403, "仅管理员可管理成员");
      if (method === "GET")
        return json(
          (await db.prepare("SELECT * FROM members ORDER BY created_at").all())
            .results,
        );
      const body = input as Record<string, string>;
      const target = (body.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target))
        throw new Failure(400, "请输入有效邮箱");
      if (method === "POST") {
        await db
          .prepare(
            "INSERT INTO members(email,role,created_at) VALUES(?,'member',?) ON CONFLICT(email) DO NOTHING",
          )
          .bind(target, now)
          .run();
        return json({ ok: true });
      }
      if (method === "DELETE") {
        await db
          .prepare("DELETE FROM members WHERE email=? AND role!='admin'")
          .bind(target)
          .run();
        return json({ ok: true });
      }
    }
    if (path[0] === "files" && path[1] && method === "GET") {
      const file = await db
        .prepare("SELECT * FROM attachments WHERE id=?")
        .bind(path[1])
        .first<{ id: string; filename: string; mime: string }>();
      if (!file) throw new Failure(404, "附件不存在");
      const object = await bucket.get(file.id);
      if (!object) throw new Failure(404, "附件文件不存在");
      return new Response(object.body, {
        headers: {
          "Content-Type": file.mime,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/'/g, "%27")}`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (path[0] !== "reports") throw new Failure(404, "接口不存在");
    if (!path[1] && method === "GET") {
      return json(
        (
          await db
            .prepare(
              "SELECT r.*, (SELECT COUNT(*) FROM attachments a WHERE a.report_id=r.id) AS file_count FROM reports r ORDER BY r.updated_at DESC",
            )
            .all()
        ).results,
      );
    }
    const id = path[1];
    const report = id
      ? await db
          .prepare("SELECT * FROM reports WHERE id=?")
          .bind(id)
          .first<Record<string, unknown>>()
      : null;
    if (id && !report) throw new Failure(404, "报告不存在");
    if (id && path[2] === "files" && method === "GET")
      return json(
        (
          await db
            .prepare(
              "SELECT * FROM attachments WHERE report_id=? ORDER BY created_at DESC",
            )
            .bind(id)
            .all()
        ).results,
      );
    if (id && !admin && report?.creator_id !== user.userId)
      throw new Failure(403, "只能修改自己创建的报告");
    if (id && path[2] === "files" && method === "POST") {
      if (Number(request.headers.get("content-length")) > 22 * 1024 * 1024)
        throw new Failure(413, "单个附件最大 20 MB");
      const file = uploadForm?.get("file");
      if (!(file instanceof File) || !file.size || file.size > 20 * 1024 * 1024)
        throw new Failure(400, "请选择不超过 20 MB 的附件");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let mime;
      try {
        mime = checkFile(file.name, bytes);
      } catch (e) {
        throw new Failure(400, (e as Error).message);
      }
      const fileId = crypto.randomUUID();
      await bucket.put(fileId, bytes, { httpMetadata: { contentType: mime } });
      try {
        await db.batch([
          db
            .prepare(
              "INSERT INTO attachments(id,report_id,filename,size,mime,created_by,created_at) VALUES(?,?,?,?,?,?,?)",
            )
            .bind(
              fileId,
              id,
              file.name.replace(/[\x00-\x1f]/g, "").slice(0, 250),
              file.size,
              mime,
              email,
              now,
            ),
          db
            .prepare("UPDATE reports SET updated_by=?,updated_at=? WHERE id=?")
            .bind(email, now, id),
        ]);
      } catch (e) {
        await bucket.delete(fileId);
        throw e;
      }
      return json({ id: fileId }, 201);
    }
    if ((!id && method === "POST") || (id && method === "PATCH" && !path[2])) {
      const body = input;
      let value;
      try {
        value = reportInput(body, regions);
      } catch (e) {
        throw new Failure(400, (e as Error).message);
      }
      const fields = [
        "name",
        "name_key",
        "county",
        "county_name",
        "client",
        "contact",
        "phone",
        "owner",
        "status",
        "due",
        "type",
        "notes",
      ];
      const values = fields.map((f) => (value as Record<string, string>)[f]);
      try {
        if (id) {
          if (!Number.isInteger(body.revision))
            throw new Failure(400, "缺少报告版本，请刷新后再试");
          const result = await db
            .prepare(
              `UPDATE reports SET ${fields.map((f) => f + "=?").join(",")},updated_by=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?`,
            )
            .bind(...values, email, now, id, body.revision)
            .run();
          if (!result.meta.changes)
            throw new Failure(409, "其他人已修改这份报告，请刷新后重新编辑");
          return json({ id });
        }
        const newId = crypto.randomUUID();
        await db
          .prepare(
            `INSERT INTO reports(id,${fields.join(",")},creator_id,created_by,updated_by,created_at,updated_at) VALUES(${Array(18).fill("?").join(",")})`,
          )
          .bind(newId, ...values, user.userId, email, email, now, now)
          .run();
        return json({ id: newId }, 201);
      } catch (e) {
        if (String(e).includes("UNIQUE constraint failed: reports.name_key"))
          throw new Failure(
            409,
            "报告名称已存在，请打开已有报告追加附件或修改名称",
          );
        throw e;
      }
    }
    throw new Failure(405, "不支持此操作");
  } catch (e) {
    if (e instanceof Failure) return json({ error: e.message }, e.status);
    if (e instanceof SyntaxError)
      return json({ error: "请求内容格式错误" }, 400);
    console.error("API request failed", e);
    return json({ error: "服务暂时不可用，请稍后重试" }, 500);
  }
}
export const GET = handle,
  POST = handle,
  PATCH = handle,
  DELETE = handle;
