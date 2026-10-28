"use client";
import { useState } from "react";
import { X, Layers, LogIn, UserPlus, LockKeyhole } from "lucide-react";
import { api, setToken } from "../lib/client-api";

export default function AccountDialog({
  initialMode,
  onClose,
  onAuthenticated,
}: {
  initialMode: "login" | "register" | "password";
  onClose: () => void;
  onAuthenticated: () => Promise<void>;
}) {
  const [mode, setMode] = useState(initialMode),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [currentPassword, setCurrentPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (mode !== "login" && password !== confirmation) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    try {
      const body =
        mode === "password"
          ? { currentPassword, newPassword: password }
          : { username, password };
      const data = await api(
        "auth/" + (mode === "password" ? "password" : mode),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (mode === "register") {
        setMode("login");
        setPassword("");
        setConfirmation("");
        setMessage("注册成功，请使用刚创建的账号登录。");
      } else {
        setToken(data.token);
        await onAuthenticated();
        onClose();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="overlay">
      <section
        className="dialog account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
      >
        <button
          className="close icon-button"
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="关闭账号窗口"
        >
          <X />
        </button>
        <div className="account-logo">
          <Layers size={27} />
        </div>
        <span className="eyebrow">县域报告地图 · 团队协作</span>
        <h2 id="account-title">
          {mode === "login"
            ? "账号登录"
            : mode === "register"
              ? "创建账号"
              : "修改密码"}
        </h2>
        <p>
          {mode === "login"
            ? "登录后查看报告任务、甲方信息与上传附件。"
            : mode === "register"
              ? "使用唯一用户名注册，加入报告协作。"
              : "修改后，其他设备上的登录会失效。"}
        </p>
        <form onSubmit={submit} className="account-form">
          {mode !== "password" && (
            <label>
              用户名
              <input
                autoFocus
                autoComplete="username"
                required
                minLength={3}
                maxLength={32}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="输入用户名"
              />
            </label>
          )}
          {mode === "password" && (
            <label>
              当前密码
              <input
                autoFocus
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                maxLength={128}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </label>
          )}
          <label>
            {mode === "password" ? "新密码" : "密码"}
            <input
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位"
            />
          </label>
          {mode !== "login" && (
            <label>
              确认密码
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="再次输入密码"
              />
            </label>
          )}
          {error && (
            <p role="alert" className="account-error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="account-success">
              {message}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {mode === "login" ? (
              <LogIn size={17} />
            ) : mode === "register" ? (
              <UserPlus size={17} />
            ) : (
              <LockKeyhole size={17} />
            )}{" "}
            {busy
              ? "正在处理…"
              : mode === "login"
                ? "登录"
                : mode === "register"
                  ? "注册账号"
                  : "保存新密码"}
          </button>
        </form>
        {mode !== "password" && (
          <div className="account-switch">
            {mode === "login" ? "还没有账号？" : "已有账号？"}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setMessage("");
                setPassword("");
                setConfirmation("");
              }}
            >
              {mode === "login" ? "立即注册" : "返回登录"}
            </button>
          </div>
        )}
        {mode === "register" && (
          <p className="account-note">
            用户名支持汉字、字母、数字、下划线和短横线，忽略英文大小写及全半角差异。注册后可查看团队报告；管理员可以停用账号。
          </p>
        )}
      </section>
    </div>
  );
}
