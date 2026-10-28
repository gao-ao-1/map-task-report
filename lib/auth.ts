export class Failure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Account = {
  id: string;
  username: string;
  username_key: string;
  password_hash: string;
  salt: string;
  role: string;
  disabled: number;
  created_at: string;
};
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export const sha256 = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export function usernameKey(input: unknown) {
  if (typeof input !== "string") throw new Failure(400, "请输入用户名");
  const value = input.normalize("NFKC").trim();
  if (!/^[\p{L}\p{N}_-]{3,32}$/u.test(value))
    throw new Failure(
      400,
      "用户名需为 3–32 位汉字、字母、数字、下划线或短横线",
    );
  return { username: value, key: value.toLowerCase() };
}
export function validPassword(input: unknown): asserts input is string {
  if (typeof input !== "string" || input.length < 8 || input.length > 128)
    throw new Failure(400, "密码长度需为 8–128 位");
}
export async function passwordHash(password: string, salt: string) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: encoder.encode(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      material,
      256,
    ),
  );
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function checkPassword(password: string, account: Account) {
  return same(
    await passwordHash(password, account.salt),
    account.password_hash,
  );
}
export const publicUser = (a: Account) => ({
  userId: a.id,
  username: a.username,
  displayName: a.username,
  role: a.role,
});
export async function initializeAdmin(
  db: D1Database,
  initialPassword?: string,
) {
  if (
    await db
      .prepare("SELECT id FROM accounts WHERE username_key='admin'")
      .first()
  )
    return;
  if (!initialPassword)
    throw new Failure(503, "管理员账号尚未初始化，请联系部署人员");
  validPassword(initialPassword);
  const salt = random(),
    hash = await passwordHash(initialPassword, salt);
  await db
    .prepare(
      "INSERT INTO accounts(id,username,username_key,password_hash,salt,role,created_at) VALUES(?,'admin','admin',?,?,'admin',?) ON CONFLICT(username_key) DO NOTHING",
    )
    .bind(crypto.randomUUID(), hash, salt, new Date().toISOString())
    .run();
}
export async function createAccount(
  db: D1Database,
  username: unknown,
  password: unknown,
) {
  const { username: name, key } = usernameKey(username);
  validPassword(password);
  if (key === "admin") throw new Failure(409, "该用户名已被使用");
  const salt = random(),
    hash = await passwordHash(password, salt);
  try {
    await db
      .prepare(
        "INSERT INTO accounts(id,username,username_key,password_hash,salt,role,created_at) VALUES(?,?,?,?,?,'member',?)",
      )
      .bind(
        crypto.randomUUID(),
        name,
        key,
        hash,
        salt,
        new Date().toISOString(),
      )
      .run();
  } catch (e) {
    if (String(e).includes("UNIQUE constraint failed: accounts.username_key"))
      throw new Failure(409, "该用户名已被使用");
    throw e;
  }
}
export async function issueSession(db: D1Database, a: Account) {
  const token = random(),
    expires = Date.now() + 12 * 60 * 60 * 1000;
  await db
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at,auth_version) VALUES(?,?,?,?)",
    )
    .bind(await sha256(token), a.id, expires, a.password_hash)
    .run();
  return { token, expiresAt: expires, user: publicUser(a) };
}
export function requestToken(request: Request) {
  return (
    /^Bearer ([a-f0-9]{64})$/.exec(
      request.headers.get("authorization") || "",
    )?.[1] || null
  );
}
export async function authenticated(db: D1Database, request: Request) {
  const token = requestToken(request);
  if (!token) throw new Failure(401, "请先登录");
  const a = await db
    .prepare(
      "SELECT a.* FROM sessions s JOIN accounts a ON a.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND a.disabled=0 AND s.auth_version=a.password_hash",
    )
    .bind(await sha256(token), Date.now())
    .first<Account>();
  if (!a) throw new Failure(401, "登录已过期或账号已停用，请重新登录");
  return a;
}
export async function rateLimit(
  db: D1Database,
  key: string,
  max: number,
  windowMs: number,
) {
  const now = Date.now();
  const hashed = await sha256(key);
  await db
    .prepare(
      "INSERT INTO auth_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN expires_at<=? THEN 1 ELSE hits+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END",
    )
    .bind(hashed, now + windowMs, now, now)
    .run();
  const row = await db
    .prepare("SELECT hits FROM auth_limits WHERE key=?")
    .bind(hashed)
    .first<{ hits: number }>();
  if (row && row.hits > max) throw new Failure(429, "操作过于频繁，请稍后重试");
}
export async function changePassword(
  db: D1Database,
  a: Account,
  current: unknown,
  next: unknown,
) {
  validPassword(current);
  validPassword(next);
  if (!(await checkPassword(current, a)))
    throw new Failure(400, "当前密码不正确");
  if (current === next) throw new Failure(400, "新密码不能与当前密码相同");
  const salt = random(),
    hash = await passwordHash(next, salt);
  const result = await db
    .prepare(
      "UPDATE accounts SET password_hash=?,salt=? WHERE id=? AND password_hash=?",
    )
    .bind(hash, salt, a.id, a.password_hash)
    .run();
  if (!result.meta.changes) throw new Failure(409, "密码已被修改，请重新登录");
  await db.prepare("DELETE FROM sessions WHERE user_id=?").bind(a.id).run();
  return issueSession(db, { ...a, password_hash: hash });
}
