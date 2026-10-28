import { env } from "cloudflare:workers";
import {
  Failure,
  Account,
  usernameKey,
  validPassword,
  initializeAdmin,
  createAccount,
  passwordHash,
  checkPassword,
  issueSession,
  authenticated,
  publicUser,
  rateLimit,
  requestToken,
  sha256,
  changePassword,
} from "../../../lib/auth";
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
async function handle(request: Request) {
  try {
    const db = env.DB,
      bucket = env.BUCKET;
    if (!db || !bucket) throw new Failure(503, "数据服务尚未配置");
    const now = new Date().toISOString();
    const path = new URL(request.url).pathname
        .split("/")
        .filter(Boolean)
        .slice(1),
      method = request.method;
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
    if (method !== "GET") {
      const origin = request.headers.get("origin");
      if (
        origin &&
        origin !== new URL(request.url).origin &&
        origin !== "https://gao-ao-1.github.io"
      )
        throw new Failure(403, "请求来源不匹配");
    }
    const ip = request.headers.get("cf-connecting-ip") || "local";
    if (path[0] === "auth" && method === "POST") {
      if (path[1] === "register") {
        await rateLimit(db, "register:" + ip, 30, 3600000);
        await createAccount(db, input.username, input.password);
        return json({ ok: true, message: "注册成功，请登录" }, 201);
      }
      if (path[1] === "login") {
        await rateLimit(db, "login-ip:" + ip, 100, 600000);
        const { key } = usernameKey(input.username);
        validPassword(input.password);
        await rateLimit(db, "login:" + ip + ":" + key, 20, 600000);
        if (key === "admin")
          await initializeAdmin(db, env.INITIAL_ADMIN_PASSWORD);
        const a = await db
          .prepare("SELECT * FROM accounts WHERE username_key=?")
          .bind(key)
          .first<Account>();
        const ok = a
          ? await checkPassword(input.password, a)
          : !!(await passwordHash(
              input.password,
              "unknown-account-dummy-salt",
            )) && false;
        if (!a || !ok || a.disabled)
          throw new Failure(401, "用户名或密码不正确，或账号已停用");
        return json(await issueSession(db, a));
      }
      if (path[1] === "logout") {
        const token = requestToken(request);
        if (token)
          await db
            .prepare("DELETE FROM sessions WHERE token_hash=?")
            .bind(await sha256(token))
            .run();
        return json({ ok: true });
      }
    }
    const account = await authenticated(db, request),
      user = publicUser(account),
      email = account.username,
      admin = account.role === "admin";
    if (path[0] === "auth" && path[1] === "password" && method === "POST") {
      await rateLimit(db, "password:" + account.id, 10, 600000);
      return json(
        await changePassword(
          db,
          account,
          input.currentPassword,
          input.newPassword,
        ),
      );
    }
    if (method === "POST" && path[2] === "files") {
      if (Number(request.headers.get("content-length")) > 22 * 1024 * 1024)
        throw new Failure(413, "单个附件最大 20 MB");
      uploadForm = await request.formData();
    }
    if (path[0] === "me" && method === "GET") return json(user);
    if (path[0] === "members") {
      if (!admin) throw new Failure(403, "仅管理员可管理成员");
      if (method === "GET")
        return json(
          (
            await db
              .prepare(
                "SELECT id,username,role,disabled,created_at FROM accounts ORDER BY created_at",
              )
              .all()
          ).results,
        );
      if (method === "PATCH") {
        if (typeof input.id !== "string" || typeof input.disabled !== "boolean")
          throw new Failure(400, "参数无效");
        const target = await db
          .prepare("SELECT role FROM accounts WHERE id=?")
          .bind(input.id)
          .first<{ role: string }>();
        if (!target) throw new Failure(404, "账号不存在");
        if (target.role === "admin")
          throw new Failure(400, "不能停用管理员账号");
        await db.batch([
          db
            .prepare(
              "UPDATE accounts SET disabled=? WHERE id=? AND role!='admin'",
            )
            .bind(input.disabled ? 1 : 0, input.id),
          db.prepare("DELETE FROM sessions WHERE user_id=?").bind(input.id),
        ]);
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
async function dispatch(request: Request) {
  const origin = request.headers.get("origin"),
    allowed =
      origin === new URL(request.url).origin ||
      origin === "https://gao-ao-1.github.io";
  if (request.method === "OPTIONS" && !allowed)
    return json({ error: "请求来源不匹配" }, 403);
  const response =
    request.method === "OPTIONS"
      ? new Response(null, { status: 204 })
      : await handle(request);
  const headers = new Headers(response.headers);
  headers.set("Vary", "Origin");
  if (origin && allowed) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,DELETE,OPTIONS",
    );
    headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
    headers.set("Access-Control-Expose-Headers", "Content-Disposition");
    headers.set("Access-Control-Max-Age", "600");
  }
  return new Response(response.body, { status: response.status, headers });
}
export const GET = dispatch,
  POST = dispatch,
  PATCH = dispatch,
  DELETE = dispatch,
  OPTIONS = dispatch;
