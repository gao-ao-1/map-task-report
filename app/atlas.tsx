"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Map,
  Files,
  Users,
  Plus,
  Search,
  ChevronRight,
  ArrowLeft,
  X,
  Upload,
  Download,
  LocateFixed,
  RefreshCw,
  LogIn,
  MapPin,
  Check,
  Clock,
  Layers,
  SlidersHorizontal,
} from "lucide-react";
import { statuses } from "../lib/domain";
import { api, getToken, setToken, downloadAttachment } from "../lib/client-api";
import AccountDialog from "./account-dialog";
import TeamPanel from "./team-panel";
type Region = {
  adcode: number;
  name: string;
  level: string;
  parent: number | null;
  lng: number;
  lat: number;
};
type Report = {
  id: string;
  name: string;
  county: string;
  county_name: string;
  client: string;
  contact: string;
  phone: string;
  owner: string;
  status: string;
  due: string;
  type: string;
  notes: string;
  creator_id: string;
  created_by: string;
  updated_by: string;
  updated_at: string;
  revision: number;
  file_count: number;
};
type User = {
  userId: string;
  username: string;
  displayName: string;
  role: string;
};
type Feature = {
  properties: {
    adcode?: number;
    name?: string;
    center?: number[];
    centroid?: number[];
    level?: string;
  };
  geometry: { type: string; coordinates: any[] };
};
type Attachment = {
  id: string;
  filename: string;
  size: number;
  created_by: string;
  created_at: string;
};
const blank = {
  name: "",
  county: "",
  client: "",
  contact: "",
  phone: "",
  owner: "",
  status: "编写中",
  due: "",
  type: "可行性研究报告",
  notes: "",
};
const send = (method: string, body: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const active = (r: Report) => ["待启动", "编写中", "审核中"].includes(r.status);
export default function Atlas({
  preview = false,
  geoBase = "/geo/",
  workspaceUrl = "",
  homeHref = "/",
}: {
  preview?: boolean;
  geoBase?: string;
  workspaceUrl?: string;
  homeHref?: string;
} = {}) {
  const [accountMode, setAccountMode] = useState<
    "login" | "register" | "password" | null
  >(null);
  const [user, setUser] = useState<User | null>(null),
    [authError, setAuthError] = useState(""),
    [reports, setReports] = useState<Report[]>([]),
    [regions, setRegions] = useState<Region[]>([]);
  const [view, setView] = useState("map"),
    [level, setLevel] = useState(100000),
    [geo, setGeo] = useState<Feature[]>([]),
    [mapError, setMapError] = useState(""),
    [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Region | null>(null),
    [hover, setHover] = useState<Region | null>(null),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("全部状态"),
    [mine, setMine] = useState(false);
  const [detail, setDetail] = useState<Report | null>(null),
    [files, setFiles] = useState<Attachment[]>([]),
    [form, setForm] = useState<any>(null),
    [uploads, setUploads] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
      null,
    ),
    mapRequest = useRef(0);
  const regionByCode = useMemo(
    () => new globalThis.Map(regions.map((r) => [r.adcode, r])),
    [regions],
  );
  const parentCodes = useMemo(
    () => new Set(regions.map((r) => r.parent)),
    [regions],
  );
  const isLeaf = (r: Region) =>
    r.level === "district" ||
    (r.level === "city" && !parentCodes.has(r.adcode));
  const countyOptions = useMemo(
    () =>
      regions.filter(
        (r) =>
          r.level === "district" ||
          (r.level === "city" && !parentCodes.has(r.adcode)),
      ),
    [regions, parentCodes],
  );
  function regionPath(r: Region) {
    const names = [r.name];
    let p = r.parent;
    while (p && p !== 100000) {
      const parent = regionByCode.get(p);
      if (!parent) break;
      names.unshift(parent.name);
      p = parent.parent;
    }
    return names.join(" / ");
  }
  function within(code: string, area: number) {
    let r = regionByCode.get(Number(code));
    while (r) {
      if (r.adcode === area) return true;
      r = r.parent ? regionByCode.get(r.parent) : undefined;
    }
    return area === 100000;
  }
  const filtered = reports.filter(
    (r) =>
      (!mine || r.creator_id === user?.userId) &&
      (status === "全部状态" || r.status === status) &&
      (!query ||
        [r.name, r.client, r.owner, r.county_name].some((v) =>
          v.toLowerCase().includes(query.toLowerCase()),
        )),
  );
  const visible = filtered.filter(
    (r) => !selected || within(r.county, selected.adcode),
  );
  const searching = query
    ? countyOptions.filter((r) => regionPath(r).includes(query)).slice(0, 8)
    : [];
  const currentRegion = regionByCode.get(level),
    focus = hover || selected;
  const focusReports = focus
    ? reports.filter((r) => within(r.county, focus.adcode))
    : [];
  const crumbs: Region[] = [];
  let current = currentRegion;
  while (current) {
    crumbs.unshift(current);
    current = current.parent ? regionByCode.get(current.parent) : undefined;
  }
  async function refresh() {
    if (preview) return;
    if (!getToken()) {
      setUser(null);
      setReports([]);
      return;
    }
    try {
      const u = await api("me");
      setUser(u);
      setAuthError("");
      setReports(await api("reports"));
    } catch (e) {
      setAuthError((e as Error).message);
      setUser(null);
      setReports([]);
      setDetail(null);
    }
  }
  useEffect(() => {
    refresh();
    fetch(`${geoBase}regions.json`)
      .then((r) => {
        if (!r.ok) throw Error("行政区目录加载失败");
        return r.json() as Promise<Region[]>;
      })
      .then(setRegions)
      .catch((e) => setMapError(e.message));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const n = ++mapRequest.current;
    setLoading(true);
    setMapError("");
    setZoom(1);
    setPan({ x: 0, y: 0 });
    fetch(`${geoBase}${level}.json`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error("该地区暂无下级边界，请返回上级或搜索县名");
        return r.json() as Promise<{ features: Feature[] }>;
      })
      .then((d) => {
        if (n === mapRequest.current) setGeo(d.features);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setGeo([]);
          setMapError(e.message);
        }
      })
      .finally(() => {
        if (n === mapRequest.current) setLoading(false);
      });
    return () => controller.abort();
  }, [level]);
  useEffect(() => {
    if (!detail) {
      setFiles([]);
      return;
    }
    let alive = true;
    setFiles([]);
    api(`reports/${detail.id}/files`)
      .then((f) => {
        if (alive) setFiles(f);
      })
      .catch((e) => setNotice(e.message));
    return () => {
      alive = false;
    };
  }, [detail]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [user?.userId]);
  useEffect(() => {
    if (!form && !detail && !accountMode) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".dialog button:not(:disabled),.dialog input:not(:disabled),.dialog select,.dialog textarea,.dialog a[href]",
        ),
      );
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", trap);
    };
  }, [Boolean(form || detail || accountMode)]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        setForm(null);
        setDetail(null);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [busy]);
  function navigate(r: Region) {
    setSelected(r);
    setHover(null);
    setQuery("");
    setView("map");
    if (isLeaf(r)) {
      setLevel(r.parent || 100000);
    } else {
      setLevel(r.adcode);
    }
  }
  function newReport() {
    if (preview) {
      window.location.assign(workspaceUrl);
      return;
    }
    if (!user) {
      setAccountMode("login");
      return;
    }
    setUploads([]);
    setForm({
      ...blank,
      owner: user.displayName,
      county: selected && isLeaf(selected) ? String(selected.adcode) : "",
    });
  }
  function editReport(r: Report) {
    setDetail(null);
    setUploads([]);
    setForm({ ...r });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    let metadataSaved = false;
    try {
      let id = form.id;
      const result = await api(
        id ? `reports/${id}` : "reports",
        send(id ? "PATCH" : "POST", form),
      );
      id = result.id;
      metadataSaved = true;
      setForm({ ...form, id, revision: form.id ? form.revision + 1 : 1 });
      // Persist the created ID before uploads, so a retry never creates a second report.
      const latest: Report[] = await api("reports");
      setReports(latest);
      const saved = latest.find((r) => r.id === id);
      if (saved) setForm(saved);
      let remaining = [...uploads];
      for (const file of uploads) {
        const data = new FormData();
        data.append("file", file);
        await api(`reports/${id}/files`, { method: "POST", body: data });
        remaining = remaining.slice(1);
        setUploads(remaining);
      }
      setForm(null);
      setNotice("报告已保存，团队成员可查看");
      await refresh();
    } catch (e) {
      setNotice(
        (metadataSaved
          ? "报告信息已保存，附件未全部完成，可再次保存重试。"
          : "") + (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  const geometry = useMemo(() => {
    const project = (p: number[]) => [
      p[0],
      (-Math.log(Math.tan(Math.PI / 4 + (p[1] * Math.PI) / 360)) * 180) /
        Math.PI,
    ];
    const rings = (f: Feature): number[][][] =>
      f.geometry.type === "Polygon"
        ? f.geometry.coordinates
        : f.geometry.type === "MultiPolygon"
          ? f.geometry.coordinates.flat()
          : f.geometry.type === "LineString"
            ? [f.geometry.coordinates]
            : f.geometry.type === "MultiLineString"
              ? f.geometry.coordinates
              : [];
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const f of geo)
      for (const ring of rings(f))
        for (const p of ring) {
          const [x, y] = project(p);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
    const scale = Math.min(890 / (maxX - minX || 1), 590 / (maxY - minY || 1));
    const xy = (p: number[]) => {
      const [x, y] = project(p);
      return [
        (x - (minX + maxX) / 2) * scale + 500,
        (y - (minY + maxY) / 2) * scale + 330,
      ];
    };
    return geo.map((f) => ({
      feature: f,
      path: rings(f)
        .map(
          (r) =>
            r
              .map(
                (p, i) =>
                  `${i ? "L" : "M"}${xy(p)
                    .map((v) => v.toFixed(2))
                    .join(",")}`,
              )
              .join(" ") + (f.geometry.type.includes("Polygon") ? "Z" : ""),
        )
        .join(" "),
      point: xy(f.properties.centroid || f.properties.center || [105, 35]),
    }));
  }, [geo]);
  return (
    <div className="app-shell">
      <aside className="rail">
        <a className="brand" href={homeHref} aria-label="县域报告地图">
          <Layers size={25} />
        </a>
        <button
          className={view === "map" ? "nav active" : "nav"}
          onClick={() => setView("map")}
          title="任务地图"
        >
          <Map size={22} />
          <span>地图</span>
        </button>
        <button
          className={view === "reports" ? "nav active" : "nav"}
          onClick={() => setView("reports")}
          title="报告台账"
        >
          <Files size={22} />
          <span>报告</span>
        </button>
        {user?.role === "admin" && (
          <button
            className={view === "team" ? "nav active" : "nav"}
            onClick={() => setView("team")}
            title="团队管理"
          >
            <Users size={22} />
            <span>团队</span>
          </button>
        )}
        <span className="rail-bottom">
          ATLAS
          <br />
          工作空间
        </span>
      </aside>
      <div className="workspace">
        <header className="header">
          <div>
            <div className="eyebrow">RESEARCH ATLAS / 科研协作</div>
            <h1>
              县域报告地图
              <span className="edition">{preview ? "地图预览" : "团队版"}</span>
            </h1>
          </div>
          <div className="header-actions">
            <span className="live">
              <i />
              {preview ? "全国地图浏览" : "共享工作空间"}
            </span>
            {user ? (
              <>
                <span className="avatar">
                  {user.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="user-label">
                  {user.displayName}
                  <small>{user.role === "admin" ? "管理员" : "团队成员"}</small>
                </span>
                <button
                  className="quiet"
                  onClick={() => setAccountMode("password")}
                >
                  修改密码
                </button>
                <button
                  className="quiet"
                  onClick={async () => {
                    try {
                      await api("auth/logout", { method: "POST" });
                    } catch {
                      setNotice(
                        "本机已退出；服务器连接中断，原会话会在到期后失效",
                      );
                    } finally {
                      setToken(null);
                      setUser(null);
                      setReports([]);
                      setDetail(null);
                      setView("map");
                    }
                  }}
                >
                  退出
                </button>
              </>
            ) : (
              <button
                className="button secondary"
                onClick={() => setAccountMode("login")}
              >
                <LogIn size={16} />
                登录
              </button>
            )}
          </div>
        </header>
        {preview && (
          <div className="auth-banner">
            当前为地图浏览页，尚未连接团队任务数据。登录、报告录入及 Word/PDF
            上传请进入完整工作空间（需要站点访问权限）。
            <a href={workspaceUrl} target="_top">
              进入工作空间 →
            </a>
          </div>
        )}
        {authError && (
          <div className="auth-banner">
            {authError}。
            {!user && (
              <button onClick={() => setAccountMode("login")}>
                登录工作空间 →
              </button>
            )}
          </div>
        )}
        <main>
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "map"
                  ? "全国项目一览"
                  : view === "reports"
                    ? "REPORT LIBRARY"
                    : "TEAM SETTINGS"}
              </div>
              <h2>
                {view === "map"
                  ? "让每一份报告，落在地图上。"
                  : view === "reports"
                    ? "报告台账"
                    : "团队成员"}
              </h2>
              <p>
                {view === "map"
                  ? "从全国到县域，查看项目分布与编写进展。"
                  : view === "reports"
                    ? "集中管理报告信息、甲方联系人与文档版本。"
                    : "查看自主注册的账号，管理成员的使用权限。"}
              </p>
            </div>
            <button className="button primary" onClick={newReport}>
              <Plus size={18} />
              {preview ? "登录并管理报告" : "新建报告"}
            </button>
          </section>
          <section className="stats">
            <div>
              <span>报告总数</span>
              <strong>
                {!user ? "—" : reports.length}
                <small>份</small>
              </strong>
              <Files />
            </div>
            <div>
              <span>正在进行</span>
              <strong>
                {!user ? "—" : reports.filter(active).length}
                <small>份</small>
              </strong>
              <Clock />
            </div>
            <div>
              <span>覆盖县域</span>
              <strong>
                {!user ? "—" : new Set(reports.map((r) => r.county)).size}
                <small>个</small>
              </strong>
              <MapPin />
            </div>
            <div>
              <span>已完成</span>
              <strong>
                {!user
                  ? "—"
                  : reports.filter((r) => r.status === "已完成").length}
                <small>份</small>
              </strong>
              <Check />
            </div>
          </section>
          {view !== "team" && (
            <section className="toolbar">
              <div className="search-wrap">
                <Search size={18} />
                <input
                  aria-label="搜索县名、报告或甲方"
                  placeholder={
                    preview
                      ? "搜索县名，直接定位…"
                      : "搜索县名、报告名称或甲方…"
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    className="icon-button"
                    onClick={() => setQuery("")}
                    aria-label="清空搜索"
                  >
                    <X size={15} />
                  </button>
                )}
                {searching.length > 0 && (
                  <div className="search-results">
                    {searching.map((r) => (
                      <button key={r.adcode} onClick={() => navigate(r)}>
                        <MapPin size={15} />
                        {regionPath(r)}
                        <ChevronRight size={14} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="filters">
                <SlidersHorizontal size={16} />
                <select
                  aria-label="任务状态"
                  disabled={preview}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option>全部状态</option>
                  {statuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    disabled={preview}
                    checked={mine}
                    onChange={(e) => setMine(e.target.checked)}
                  />
                  我创建的
                </label>
                <button
                  className="icon-button"
                  onClick={refresh}
                  title="刷新报告"
                >
                  <RefreshCw size={17} />
                </button>
              </div>
            </section>
          )}
          {view === "map" && (
            <section className="map-layout">
              <div className="map-panel">
                <div className="map-top">
                  <div className="breadcrumbs">
                    <button
                      onClick={() => {
                        setLevel(100000);
                        setSelected(null);
                        setHover(null);
                      }}
                    >
                      全国
                    </button>
                    {crumbs
                      .filter((r) => r.adcode !== 100000)
                      .map((r) => (
                        <span key={r.adcode}>
                          <ChevronRight size={12} />
                          <button onClick={() => navigate(r)}>{r.name}</button>
                        </span>
                      ))}
                  </div>
                  <span className="map-hint">悬停查看任务 · 点击进入地区</span>
                </div>
                <div className="map-canvas">
                  {loading ? (
                    <div className="map-message">正在载入行政区边界…</div>
                  ) : mapError ? (
                    <div className="map-message">
                      {mapError}
                      <button
                        className="button secondary"
                        onClick={() =>
                          setLevel(currentRegion?.parent || 100000)
                        }
                      >
                        返回上级
                      </button>
                    </div>
                  ) : (
                    <svg
                      role="img"
                      aria-label="全国报告任务交互地图"
                      viewBox="0 0 1000 660"
                      onPointerDown={(e) => {
                        if (e.target === e.currentTarget)
                          drag.current = {
                            x: e.clientX,
                            y: e.clientY,
                            px: pan.x,
                            py: pan.y,
                          };
                      }}
                      onPointerMove={(e) => {
                        if (drag.current)
                          setPan({
                            x:
                              drag.current.px +
                              ((e.clientX - drag.current.x) * 1000) /
                                e.currentTarget.clientWidth,
                            y:
                              drag.current.py +
                              ((e.clientY - drag.current.y) * 660) /
                                e.currentTarget.clientHeight,
                          });
                      }}
                      onPointerUp={() => (drag.current = null)}
                      onPointerLeave={() => {
                        drag.current = null;
                        setHover(null);
                      }}
                    >
                      <defs>
                        <pattern
                          id="dots"
                          width="22"
                          height="22"
                          patternUnits="userSpaceOnUse"
                        >
                          <circle cx="1" cy="1" r="0.7" fill="#cbd8d5" />
                        </pattern>
                        <filter id="shadow">
                          <feDropShadow
                            dx="0"
                            dy="5"
                            stdDeviation="5"
                            floodColor="#426b60"
                            floodOpacity=".10"
                          />
                        </filter>
                      </defs>
                      <rect
                        width="1000"
                        height="660"
                        fill="url(#dots)"
                        pointerEvents="none"
                      />
                      <g
                        transform={`translate(${500 + pan.x} ${330 + pan.y}) scale(${zoom}) translate(-500 -330)`}
                        filter="url(#shadow)"
                      >
                        {geometry.map(({ feature: f, path, point }, i) => {
                          const code = f.properties.adcode,
                            r = code ? regionByCode.get(code) : undefined,
                            items = filtered.filter(
                              (t) => code && within(t.county, code),
                            ),
                            ongoing = items.some(active),
                            chosen = selected?.adcode === code;
                          return (
                            <g key={code || i}>
                              <path
                                className="region"
                                d={path}
                                fill={
                                  chosen
                                    ? "#92c8b5"
                                    : ongoing
                                      ? "#7dbba6"
                                      : items.length
                                        ? "#c9dbd0"
                                        : "#e5eee9"
                                }
                                stroke={chosen ? "#23765b" : "#a5bdb2"}
                                strokeWidth={chosen ? 2 : 0.9}
                                vectorEffect="non-scaling-stroke"
                                fillRule="evenodd"
                                tabIndex={r ? 0 : undefined}
                                role={r ? "button" : undefined}
                                aria-label={
                                  !user
                                    ? `${f.properties.name || "边界"}，浏览地区`
                                    : `${f.properties.name || "边界"}，${items.length}份报告`
                                }
                                onMouseEnter={() => setHover(r || null)}
                                onFocus={() => setHover(r || null)}
                                onBlur={() => setHover(null)}
                                onClick={() => r && navigate(r)}
                                onKeyDown={(e) => {
                                  if (
                                    r &&
                                    (e.key === "Enter" || e.key === " ")
                                  ) {
                                    e.preventDefault();
                                    navigate(r);
                                  }
                                }}
                              />
                              {r && (
                                <text
                                  x={point[0]}
                                  y={point[1]}
                                  className="map-label"
                                  textAnchor="middle"
                                  pointerEvents="none"
                                >
                                  {r.name.replace(
                                    /壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省$/g,
                                    "",
                                  )}
                                  {items.length ? ` · ${items.length}` : ""}
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </g>
                    </svg>
                  )}
                  <div className="zoom-controls">
                    <button
                      onClick={() => setZoom((z) => Math.min(5, z + 0.4))}
                      aria-label="放大"
                    >
                      +
                    </button>
                    <button
                      onClick={() => setZoom((z) => Math.max(0.7, z - 0.4))}
                      aria-label="缩小"
                    >
                      −
                    </button>
                    <button
                      onClick={() => {
                        setZoom(1);
                        setPan({ x: 0, y: 0 });
                      }}
                      aria-label="重置视图"
                    >
                      <LocateFixed size={18} />
                    </button>
                    {level !== 100000 && (
                      <button
                        onClick={() => {
                          setLevel(currentRegion?.parent || 100000);
                          setSelected(null);
                        }}
                        aria-label="返回上级"
                      >
                        <ArrowLeft size={18} />
                      </button>
                    )}
                  </div>
                  <div className="map-caption">
                    CHINA · PROJECT DISTRIBUTION
                  </div>
                </div>
                <div className="map-bottom">
                  <div className="legend">
                    <span>
                      <i className="ongoing" />
                      有进行中任务
                    </span>
                    <span>
                      <i className="finished" />
                      其他状态任务
                    </span>
                    <span>
                      <i />
                      {!user ? "登录后查看任务" : "暂无任务"}
                    </span>
                  </div>
                  <span>边界来源：DataV.GeoAtlas</span>
                </div>
              </div>
              <aside className="region-panel">
                <div className="region-heading">
                  <span className="eyebrow">REGION OVERVIEW</span>
                  <h3>{focus?.name || "选择一个地区"}</h3>
                  <p>
                    {focus
                      ? regionPath(focus)
                      : "将鼠标移到地图上，查看县域任务。"}
                  </p>
                </div>
                {focus ? (
                  <>
                    <div className="region-count">
                      <strong>
                        {!user ? "—" : focusReports.filter(active).length}
                      </strong>
                      <span>
                        {!user ? "登录后查看任务" : "份正在进行的报告"}
                      </span>
                    </div>
                    <div className="region-tasks">
                      {focusReports.length ? (
                        focusReports.map((r) => (
                          <button
                            className="task-card"
                            key={r.id}
                            onClick={() => setDetail(r)}
                          >
                            <div>
                              <span
                                className={`status status-${statuses.indexOf(r.status)}`}
                              >
                                {r.status}
                              </span>
                              <span>{r.type}</span>
                            </div>
                            <h4>{r.name}</h4>
                            <p>甲方　{r.client}</p>
                            <p>
                              联系　{r.contact || "未填写"} {r.phone}
                            </p>
                            <footer>
                              <span>{r.owner}</span>
                              <span>{r.due || "未设截止日期"}</span>
                            </footer>
                          </button>
                        ))
                      ) : (
                        <div className="empty compact">
                          <Files size={28} />
                          <h4>{!user ? "登录后查看报告" : "这里还没有报告"}</h4>
                          <p>
                            {!user
                              ? "未登录时仅展示地区边界，不代表该地区没有任务。"
                              : "点击地区后，可在此新建任务。"}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="empty">
                    <MapPin size={38} />
                    <h4>从一个县域开始</h4>
                    <p>
                      点击省、市逐级进入县域，
                      <br />
                      也可以在上方直接搜索县名。
                    </p>
                  </div>
                )}
                <div className="panel-tip">
                  同名报告自动拦截
                  <br />
                  支持 Word / PDF，单个附件最大 20 MB
                </div>
              </aside>
            </section>
          )}
          {(view === "map" || view === "reports") && (
            <section className="report-section">
              <div className="section-title">
                <h3>
                  {selected ? `${selected.name}的报告` : "报告列表"}
                  <span>{!user ? "未登录" : visible.length}</span>
                </h3>
                {selected && (
                  <button
                    className="text-button"
                    onClick={() => setSelected(null)}
                  >
                    查看全部地区 ×
                  </button>
                )}
              </div>
              {visible.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>报告名称 / 类型</th>
                        <th>所属县域</th>
                        <th>甲方单位</th>
                        <th>负责人</th>
                        <th>状态</th>
                        <th>计划完成</th>
                        <th>附件</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r) => (
                        <tr key={r.id} onClick={() => setDetail(r)}>
                          <td>
                            <button
                              className="report-link"
                              onClick={() => setDetail(r)}
                            >
                              {r.name}
                            </button>
                            <small>{r.type}</small>
                          </td>
                          <td>{r.county_name}</td>
                          <td>{r.client}</td>
                          <td>{r.owner}</td>
                          <td>
                            <span
                              className={`status status-${statuses.indexOf(r.status)}`}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td>{r.due || "—"}</td>
                          <td>{r.file_count} 份</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty list-empty">
                  <Files size={30} />
                  <div>
                    <h4>
                      {!user
                        ? "登录账号，查看团队报告"
                        : reports.length
                          ? "没有符合筛选条件的报告"
                          : "还没有报告，开始记录第一个项目"}
                    </h4>
                    <p>
                      {!user
                        ? "支持自主注册；登录后即可录入报告和上传 Word/PDF。"
                        : reports.length
                          ? "试试其他县名、任务状态或清除筛选。"
                          : "新建一份报告，地图会自动展示它所在的县域。"}
                    </p>
                  </div>
                  <button className="button secondary" onClick={newReport}>
                    <Plus size={16} />
                    {preview ? "进入工作空间" : "新建报告"}
                  </button>
                </div>
              )}
            </section>
          )}
          {view === "team" && user?.role === "admin" && (
            <TeamPanel onNotice={setNotice} />
          )}
          <footer className="page-footer">
            <span>ATLAS / 县域报告协作平台</span>
            <span>地区边界按数据源提供；台湾暂无县级细分边界。</span>
          </footer>
        </main>
      </div>
      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <section
            className="dialog detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close icon-button"
              onClick={() => setDetail(null)}
              aria-label="关闭"
            >
              <X />
            </button>
            <span
              className={`status status-${statuses.indexOf(detail.status)}`}
            >
              {detail.status}
            </span>
            <h2 id="detail-title">{detail.name}</h2>
            <p>
              {regionByCode.get(Number(detail.county))
                ? regionPath(regionByCode.get(Number(detail.county))!)
                : detail.county_name}{" "}
              · {detail.type}
            </p>
            <dl className="details">
              {[
                ["甲方单位", detail.client],
                ["联系人", detail.contact],
                ["联系电话", detail.phone],
                ["负责人", detail.owner],
                ["计划完成", detail.due],
                ["创建人", detail.created_by],
                ["最后修改人", detail.updated_by],
                [
                  "更新时间",
                  new Date(detail.updated_at).toLocaleString("zh-CN"),
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v || "未填写"}</dd>
                </div>
              ))}
            </dl>
            {detail.notes && <p className="notes">{detail.notes}</p>}
            <h3>
              报告附件 <span className="muted">{files.length} 份</span>
            </h3>
            <div className="file-list">
              {files.length ? (
                files.map((f) => (
                  <button
                    key={f.id}
                    onClick={async () => {
                      try {
                        await downloadAttachment(f.id, f.filename);
                      } catch (e) {
                        setNotice((e as Error).message);
                      }
                    }}
                    className="file-row"
                  >
                    <Files size={22} />
                    <span>
                      <strong>{f.filename}</strong>
                      <small>
                        {(f.size / 1024).toFixed(1)} KB ·{" "}
                        {new Date(f.created_at).toLocaleString("zh-CN")} ·{" "}
                        {f.created_by}
                      </small>
                    </span>
                    <Download size={18} />
                  </button>
                ))
              ) : (
                <p className="muted">
                  暂无附件，可通过编辑报告上传 Word 或 PDF。
                </p>
              )}
            </div>
            {(user?.role === "admin" || detail.creator_id === user?.userId) && (
              <button
                className="button primary"
                onClick={() => editReport(detail)}
              >
                编辑信息 / 追加附件
              </button>
            )}
          </section>
        </div>
      )}
      {form && (
        <div className="overlay">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
          >
            <button
              className="close icon-button"
              disabled={busy}
              onClick={() => setForm(null)}
              aria-label="关闭"
            >
              <X />
            </button>
            <span className="eyebrow">REPORT WORKSPACE</span>
            <h2 id="form-title">{form.id ? "编辑报告" : "新建报告"}</h2>
            <p>填写项目与甲方信息，将报告关联到一个县域。</p>
            <form onSubmit={save}>
              <div className="form-grid">
                <label className="full">
                  报告名称 <b>*</b>
                  <input
                    autoFocus
                    required
                    maxLength={200}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="请输入唯一的报告名称"
                  />
                  <small>
                    全团队名称唯一；忽略首尾空格、连续空格、英文大小写和全半角差异。
                  </small>
                </label>
                <label className="full">
                  所属县域 <b>*</b>
                  <select
                    required
                    value={form.county}
                    onChange={(e) =>
                      setForm({ ...form, county: e.target.value })
                    }
                  >
                    <option value="">
                      选择省 / 市 / 县（可用键盘输入定位）
                    </option>
                    {countyOptions.map((r) => (
                      <option key={r.adcode} value={r.adcode}>
                        {regionPath(r)}
                      </option>
                    ))}
                  </select>
                </label>
                {[
                  ["client", "甲方单位", true],
                  ["owner", "负责人", true],
                  ["contact", "联系人", false],
                  ["phone", "联系电话", false],
                  ["type", "报告类型", false],
                ].map(([key, label, required]) => (
                  <label key={String(key)}>
                    {label}
                    {required && <b> *</b>}
                    <input
                      required={Boolean(required)}
                      maxLength={200}
                      value={form[String(key)]}
                      onChange={(e) =>
                        setForm({ ...form, [String(key)]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <label>
                  任务状态
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value })
                    }
                  >
                    {statuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  计划完成日期
                  <input
                    type="date"
                    value={form.due}
                    onChange={(e) => setForm({ ...form, due: e.target.value })}
                  />
                </label>
                <label className="full">
                  备注
                  <textarea
                    rows={3}
                    maxLength={3000}
                    value={form.notes}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                  />
                </label>
                <label className="upload-zone full">
                  <Upload size={25} />
                  <strong>选择 Word / PDF 附件</strong>
                  <span>
                    支持 .doc、.docx、.pdf · 每份不超过 20 MB · 可多选
                  </span>
                  <input
                    type="file"
                    multiple
                    accept=".doc,.docx,.pdf"
                    disabled={busy}
                    onChange={(e) => {
                      const next = Array.from(e.target.files || []);
                      if (
                        next.some(
                          (f) =>
                            f.size > 20 * 1024 * 1024 ||
                            !f.size ||
                            !/\.(docx?|pdf)$/i.test(f.name),
                        )
                      ) {
                        setNotice("请选择有效且不超过 20 MB 的 Word/PDF 文件");
                        e.target.value = "";
                        return;
                      }
                      setUploads(next);
                    }}
                  />
                </label>
                {uploads.length > 0 && (
                  <ul className="full selected-files">
                    {uploads.map((f, i) => (
                      <li key={i}>
                        {f.name}
                        <span>{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="dialog-actions">
                <span>已有附件会保留，上传内容作为新的版本记录。</span>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setForm(null)}
                >
                  取消
                </button>
                <button className="button primary" disabled={busy}>
                  {busy ? "正在保存与上传…" : "保存报告"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {accountMode && (
        <AccountDialog
          initialMode={accountMode}
          onClose={() => setAccountMode(null)}
          onAuthenticated={refresh}
        />
      )}
      {notice && (
        <div role="alert" className="toast">
          {notice}
          <button
            className="icon-button"
            onClick={() => setNotice("")}
            aria-label="关闭提示"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
