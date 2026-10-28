"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/client-api";
type Member = {
  id: string;
  username: string;
  role: string;
  disabled: number;
  created_at: string;
};
export default function TeamPanel({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const [members, setMembers] = useState<Member[]>([]),
    [busy, setBusy] = useState("");
  useEffect(() => {
    api("members")
      .then(setMembers)
      .catch((e) => onNotice(e.message));
  }, []);
  async function toggle(m: Member) {
    setBusy(m.id);
    try {
      await api("members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, disabled: !m.disabled }),
      });
      setMembers(await api("members"));
      onNotice(
        m.disabled
          ? "账号已启用"
          : "账号已停用，其登录已失效；报告与附件仍保留",
      );
    } catch (e) {
      onNotice((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="report-section team">
      <h3>注册账号与权限</h3>
      <p>
        用户可自行注册，用户名唯一。成员可以查看团队报告、创建报告和修改自己创建的报告；管理员可以管理全部报告和停用成员账号。
      </p>
      {members.map((m) => (
        <div className="member" key={m.id}>
          <span className="avatar">{m.username[0].toUpperCase()}</span>
          <strong>{m.username}</strong>
          <span>
            {m.role === "admin" ? "管理员" : m.disabled ? "已停用" : "正常"}
          </span>
          {m.role !== "admin" && (
            <button
              className="text-button"
              disabled={!!busy}
              onClick={() => toggle(m)}
            >
              {m.disabled ? "启用账号" : "停用账号"}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
