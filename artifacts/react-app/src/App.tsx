import { useState, useEffect, useRef, createContext, useContext, useCallback, useMemo } from "react";
import { sbBearer } from './lib/sbAuth'
import { TZ_OPTIONS, DEFAULT_TZ, DEFAULT_TIME, useDeadline, clearTzCache, zonedTimeToIso, tzShort, timeLabel } from './lib/tz'
import {
  ResponsiveContainer, LineChart, AreaChart, BarChart,
  Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

// ─── RESPONSIVE HOOK ──────────────────────────────────────────────────────────
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}
import Messaging from "./components/Messaging";
import DietBuilder from "./components/DietBuilder";
import Notifications from "./components/Notifications";
import { HuddleProvider, DndButton } from "./components/HuddleHub";
import { LN, LoomPicker, loomSet, loomShow, loomIsShown, useLoomOn } from "./components/LoomPrivacy";
import Week4 from "./components/Week4";
import Week5 from "./components/Week5";
import Week6 from "./components/Week6";
import Week7 from "./components/Week7";
import DbaChat from "./components/DbaChat";
import DbaHuddles from "./components/DbaHuddles";
import DbaCalendar from "./components/DbaCalendar";
import { useTeamHubUnread } from "./lib/teamUnread";
import Wearables from "./components/Wearables";
import CheckinFormEditor from "./components/CheckinFormEditor";
import InstallBanner from "./components/InstallBanner";
import { applyPwaBrand, resetPwaBrand } from "./pwaBrand";
import { supabase } from "./supabaseClient";

// ─── BRAND TOKENS — Official Eden Colors ─────────────────────────────────────
// Primary: #ffa600 (Eden Gold)  Base: #000000 (Black)  Light: #ffffff (White)
const B = {
  gold:    "#ffa600",   // PRIMARY — buttons, accents, active states
  black:   "#000000",   // BASE — page backgrounds
  white:   "#ffffff",   // TEXT — all labels, headings
  surface: "#111111",   // cards, panels (near-black for depth)
  card:    "#1a1a1a",   // elevated cards
  border:  "#2a2a2a",   // dividers, input borders
  muted:   "#888888",   // secondary text, inactive icons
  dim:     "#333333",   // subtle backgrounds inside cards
  danger:  "#ff4444",   // errors, alerts
  success: "#4FD89A",   // positive states
  text:    "#ffffff",   // alias for white — body text
  goldDim: "#ffa60022", // gold at low opacity for backgrounds
  goldMid: "#ffa60044", // gold at medium opacity for borders
};

// ─── WHITE-LABEL PALETTE ─────────────────────────────────────────────────────
// Turns an organizations row (brand_color + brand_colors jsonb) into a full
// theme. Falls back gracefully to the Eden gold theme when nothing is set.
const wlPalette = (org) => {
  const isHex = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim());
  const primary = isHex(org?.brand_color) ? org.brand_color.trim() : B.gold;
  const extra = Array.isArray(org?.brand_colors) ? org.brand_colors.filter(isHex).map(c => c.trim()) : [];
  const secondary = extra[0] || primary;
  const accent = extra[1] || extra[0] || primary;
  const all = [primary, ...extra];
  return { primary, secondary, accent, extra, all, nth: (i) => all[i % all.length] };
};

// ─── AUTH CONTEXT ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

// ─── OWNER ────────────────────────────────────────────────────────────────────
// The account that sits above super admin. Change this address (and the
// matching Supabase Auth email) to swap the owner login.
const OWNER_EMAIL = "info@edencommunications.io";

// ─── ICONS ───────────────────────────────────────────────────────────────────
// @ts-nocheck
const Ic = ({ n, size = 20, s = undefined, c = B.muted }) => {
  const sz = size ?? s ?? 20;
  const d = {
    msg:      <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke={c} strokeWidth="1.8"/></>,
    diet:     <><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" fill="none" stroke={c} strokeWidth="1.8"/></>,
    labs:     <><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11l-4 4" fill="none" stroke={c} strokeWidth="1.8"/><path d="m9 14 4 4 8-8" fill="none" stroke={c} strokeWidth="1.8"/></>,
    photos:   <><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke={c} strokeWidth="1.8"/><circle cx="8.5" cy="8.5" r="1.5" fill={c}/><path d="m21 15-5-5L5 21" fill="none" stroke={c} strokeWidth="1.8"/></>,
    habits:   <><polyline points="9,11 12,14 22,4" fill="none" stroke={c} strokeWidth="1.8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" fill="none" stroke={c} strokeWidth="1.8"/></>,
    checkin:  <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke={c} strokeWidth="1.8"/><polyline points="14,2 14,8 20,8" fill="none" stroke={c} strokeWidth="1.8"/><line x1="16" y1="13" x2="8" y2="13" stroke={c} strokeWidth="1.8"/><line x1="16" y1="17" x2="8" y2="17" stroke={c} strokeWidth="1.8"/></>,
    clients:  <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" fill="none" stroke={c} strokeWidth="1.8"/><circle cx="9" cy="7" r="4" fill="none" stroke={c} strokeWidth="1.8"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" fill="none" stroke={c} strokeWidth="1.8"/></>,
    admin:    <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="none" stroke={c} strokeWidth="1.8"/></>,
    home:     <><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="none" stroke={c} strokeWidth="1.8"/><polyline points="9,21 9,12 15,12 15,21" fill="none" stroke={c} strokeWidth="1.8"/></>,
    links:    <><circle cx="18" cy="5" r="3" fill="none" stroke={c} strokeWidth="1.8"/><circle cx="6" cy="12" r="3" fill="none" stroke={c} strokeWidth="1.8"/><circle cx="18" cy="19" r="3" fill="none" stroke={c} strokeWidth="1.8"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke={c} strokeWidth="1.8"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke={c} strokeWidth="1.8"/></>,
    eye:      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="none" stroke={c} strokeWidth="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke={c} strokeWidth="1.8"/></>,
    eyeoff:   <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" fill="none" stroke={c} strokeWidth="1.8"/><line x1="1" y1="1" x2="23" y2="23" stroke={c} strokeWidth="1.8"/></>,
    lock:     <><rect x="3" y="11" width="18" height="11" rx="2" fill="none" stroke={c} strokeWidth="1.8"/><path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke={c} strokeWidth="1.8"/></>,
    mail:     <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" fill="none" stroke={c} strokeWidth="1.8"/><polyline points="22,6 12,13 2,6" fill="none" stroke={c} strokeWidth="1.8"/></>,
    back:     <><polyline points="15,18 9,12 15,6" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></>,
    logout:   <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" fill="none" stroke={c} strokeWidth="1.8"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke={c} strokeWidth="1.8"/><line x1="16" y1="2" x2="16" y2="6" stroke={c} strokeWidth="1.8"/><line x1="8" y1="2" x2="8" y2="6" stroke={c} strokeWidth="1.8"/><line x1="3" y1="10" x2="21" y2="10" stroke={c} strokeWidth="1.8"/></>,
    workout:  <><path d="M6.5 6.5h11M6.5 17.5h11M3 10h3v4H3zM18 10h3v4h-3z" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></>,
    community:<><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" fill="none" stroke={c} strokeWidth="1.8"/><line x1="2" y1="20" x2="2.01" y2="20" stroke={c} strokeWidth="2.5" strokeLinecap="round"/></>,
    learn:    <><path d="M22 10v6M2 10l10-5 10 5-10 5z" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 12v5c3 3 9 3 12 0v-5" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></>,
    upload:   <><polyline points="16,16 12,12 8,16" fill="none" stroke={c} strokeWidth="1.8"/><line x1="12" y1="12" x2="12" y2="21" stroke={c} strokeWidth="1.8"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" fill="none" stroke={c} strokeWidth="1.8"/></>,
    shop:     <><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" fill="none" stroke={c} strokeWidth="1.8"/><line x1="3" y1="6" x2="21" y2="6" stroke={c} strokeWidth="1.8"/><path d="M16 10a4 4 0 0 1-8 0" fill="none" stroke={c} strokeWidth="1.8"/></>,
    team:     <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" fill="none" stroke={c} strokeWidth="1.8"/><circle cx="9" cy="7" r="4" fill="none" stroke={c} strokeWidth="1.8"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" fill="none" stroke={c} strokeWidth="1.8"/></>,
    progress: <><polyline points="22,12 18,12 15,21 9,3 6,12 2,12" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></>,
    watch:    <><circle cx="12" cy="12" r="6" fill="none" stroke={c} strokeWidth="1.8"/><polyline points="12,9 12,12 14,13.5" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"/><path d="M9 3.5h6M9 20.5h6" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></>,
  };
  return <svg width={sz} height={sz} viewBox="0 0 24 24" style={{display:"block",flexShrink:0}}>{d[n]}</svg>;
};

// ─── LIFESTYLE OF EDEN LOGO — uploaded brand mark ────────────────────────────
const EdenLogo = ({ size = 44 }) => (
  <div style={{
    width: size,
    height: size,
    borderRadius: "50%",
    border: "2px solid #ffa600",
    overflow: "hidden",
    flexShrink: 0,
    backgroundColor: "#ffffff",
  }}>
    <img
      src="/eden-logo-new.jpg"
      alt="Lifestyle of Eden University"
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  </div>
);

// Alias so existing references to HoneycombLogo still work
const HoneycombLogo = EdenLogo;

// ─── SHARED UI COMPONENTS ─────────────────────────────────────────────────────
const Input = ({ label, type = "text", value, onChange, placeholder, icon, rightIcon, onRightClick, error }) => (
  <div style={{ marginBottom: 16 }}>
    {label && <label style={{ display:"block", fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:6 }}>{label}</label>}
    <div style={{ position:"relative" }}>
      {icon && <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)" }}>{icon}</span>}
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{ width:"100%", background:B.card, border:`1px solid ${error?B.danger:B.border}`, borderRadius:10, padding:icon?"12px 14px 12px 44px":"12px 14px", color:B.text, fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }}
      />
      {rightIcon && <button onClick={onRightClick} style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", padding:0 }}>{rightIcon}</button>}
    </div>
    {error && <p style={{ fontSize:11, color:B.danger, marginTop:4 }}>{error}</p>}
  </div>
);

const Btn = ({ children, onClick, variant="primary", disabled, fullWidth, style: sx }) => {
  const styles = {
    primary:   { background:`linear-gradient(135deg, #ffb733, #ffa600)`, color:"#000000", fontWeight:800 },
    secondary: { background:B.card, color:B.text, border:`1px solid ${B.border}` },
    ghost:     { background:"none", color:B.gold, border:"none" },
    danger:    { background:B.danger, color:"#fff" },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, borderRadius:12, padding:"13px 20px", border:"none", cursor:disabled?"not-allowed":"pointer", fontWeight:700, fontSize:14, width:fullWidth?"100%":"auto", opacity:disabled?0.5:1, transition:"opacity 0.2s", fontFamily:"inherit", ...styles[variant], ...sx }}>
      {children}
    </button>
  );
};

const Card = ({ children, style: sx }) => (
  <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:16, ...sx }}>{children}</div>
);

const Badge = ({ children, color = B.gold }) => (
  <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20, background:color+"22", color, letterSpacing:0.8, textTransform:"uppercase" }}>{children}</span>
);

const NavTab = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3, background:"none", border:"none", cursor:"pointer", padding:"6px 0 8px" }}>
    <Ic n={icon} size={20} c={active?B.gold:B.muted}/>
    <span style={{ fontSize:9, fontWeight:600, color:active?B.gold:B.muted, letterSpacing:0.5, textTransform:"uppercase" }}>{label}</span>
  </button>
);

const Screen = ({ children, scroll=true }) => (
  <div style={{ flex:1, overflowY:scroll?"auto":"hidden", overflowX:"hidden" }}>{children}</div>
);

const PageHeader = ({ title, subtitle, onBack, right }) => (
  <div style={{ padding:"20px 20px 0", borderBottom:`1px solid ${B.border}`, paddingBottom:16, marginBottom:0 }}>
    {onBack && (
      <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:6, padding:0, marginBottom:12 }}>
        <Ic n="back" size={18} c={B.muted}/><span style={{ fontSize:12, color:B.muted }}>Back</span>
      </button>
    )}
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
      <div>
        <h1 style={{ fontSize:20, fontWeight:700, color:B.text, margin:0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize:12, color:B.muted, margin:"4px 0 0" }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  </div>
);

const Divider = () => <div style={{ height:1, background:B.border, margin:"12px 0" }}/>;

// ─── SCREENS ─────────────────────────────────────────────────────────────────

// Circle logo for a branded (white-label) login — org initial on brand color
const OrgLogo = ({ org, size = 44 }) => {
  const p = wlPalette(org);
  const logoUrl = typeof org?.logo_url === "string" && org.logo_url.trim() ? org.logo_url.trim() : null;
  const [imgFailed, setImgFailed] = useState(false);
  // Reset failure state if the logo URL changes (e.g. admin just updated it)
  useEffect(() => { setImgFailed(false); }, [logoUrl]);
  if (logoUrl && !imgFailed) {
    return (
      <div style={{ width:size, height:size, borderRadius:"50%", border:`2px solid ${p.primary}`, overflow:"hidden",
        background:"#ffffff", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <img src={logoUrl} alt={org?.name || "Organization logo"} onError={()=>setImgFailed(true)}
          style={{ width:"88%", height:"88%", objectFit:"contain", display:"block" }}/>
      </div>
    );
  }
  // No logo uploaded (or it failed to load) — keep the Eden logo so the app never looks unbranded;
  // the org's NAME still replaces Eden's everywhere.
  return <EdenLogo size={size}/>;
};

// LOGIN
// brandOrg: organizations row loaded from a branded link (?org=<slug>) — themes
// the whole login page with that org's name and palette. Null = Eden default.
const LoginScreen = ({ onLogin, onForgot, brandOrg = null }) => {
  const wl = brandOrg ? wlPalette(brandOrg) : null;
  const primary = wl ? wl.primary : B.gold;
  const secondary = wl ? wl.secondary : "#ffb733";
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = () => {
    setError("");
    if (!email || !pass) { setError("Please enter your email and password."); return; }
    setLoading(true);
    setTimeout(async () => {
      {
        // Real authentication — Supabase Auth (hashed passwords).
        const emailNorm = email.toLowerCase();
        const finishAuthLogin = async (authUser: any) => {
          // Profile stays the app's identity record — load it by email
          let p: any = null;
          try {
            const rows = await sbGet('user_profiles',
              `email=eq.${encodeURIComponent(emailNorm)}&select=id,name,full_name,email,role,is_active,community_only`);
            p = Array.isArray(rows) ? rows[0] : null;
          } catch {}
          if (p && p.is_active === false && p.community_only !== true) {
            await supabase.auth.signOut().catch(()=>{});
            setError("Your account has been deactivated. Please contact your coach or the admin to regain access.");
            return;
          }
          // Audit trail: record every successful login server-side, so it works
          // for ALL roles including clients (never blocks the login itself)
          try {
            const { data: sess } = await supabase.auth.getSession();
            const tok = sess?.session?.access_token;
            if (tok) fetch('/api/audit/login', { method:'POST', headers:{ Authorization:`Bearer ${tok}` } }).catch(()=>{});
          } catch {}
          onLogin({
            email: emailNorm,
            name: p?.name || p?.full_name || authUser?.user_metadata?.name || emailNorm,
            role: p?.role || 'client',
            // Pure DBA members (login created by a DBA invite) are marked in
            // auth metadata — user_profiles can't hold a dba_member role.
            dbaMember: authUser?.user_metadata?.intended_role === 'dba_member',
            communityOnly: p?.is_active === false && p?.community_only === true,
            mustChangePassword: authUser?.user_metadata?.must_change_password === true,
          });
        };
        try {
          const { data, error: authErr } = await supabase.auth.signInWithPassword({ email: emailNorm, password: pass });
          if (!authErr && data?.user) {
            await finishAuthLogin(data.user);
            setLoading(false);
            return;
          }
          // Wrong password OR a legacy account that predates Supabase Auth —
          // try the one-time server-side migration of the old temp password.
          const mig = await fetch('/api/auth/migrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailNorm, password: pass }),
          });
          if (mig.ok) {
            const retry = await supabase.auth.signInWithPassword({ email: emailNorm, password: pass });
            if (!retry.error && retry.data?.user) {
              await finishAuthLogin(retry.data.user);
              setLoading(false);
              return;
            }
          } else if (mig.status === 403) {
            setError("Your account has been deactivated. Please contact your coach or the admin to regain access.");
            setLoading(false);
            return;
          }
        } catch {}
        // Audit trail: record the failed attempt (server only logs real accounts)
        try {
          fetch('/api/audit/login-failed', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailNorm }),
          }).catch(() => {});
        } catch {}
        setError("Invalid email or password.");
      }
      setLoading(false);
    }, 800);
  };

  const isMobile = useIsMobile();

  return (
    <div style={{ minHeight:"100vh", width:"100%", background:"#000000", display:"flex", flexDirection: isMobile ? "column" : "row" }}>
      {/* Branding panel — full left on desktop, compact top on mobile */}
      {isMobile ? (
        <div style={{ background: brandOrg ? `linear-gradient(160deg, ${primary}22 0%, #000000 100%)` : `linear-gradient(160deg, #1a1200 0%, #000000 100%)`, padding:"32px 20px 24px", display:"flex", flexDirection:"column", alignItems:"center", borderBottom:`1px solid #1a1a1a` }}>
          {brandOrg ? <OrgLogo org={brandOrg} size={72}/> : <EdenLogo size={72}/>}
          <h1 style={{ fontSize:22, fontWeight:800, color:"#ffffff", margin:"16px 0 4px", textAlign:"center" }}>{brandOrg ? brandOrg.name : "Eden Communications"}</h1>
          <p style={{ fontSize:12, color:"#888888", margin:0, textAlign:"center" }}>{brandOrg ? `The private platform for ${brandOrg.name}` : "The private platform for Lifestyle of Eden University"}</p>
        </div>
      ) : (
        <div style={{ flex:1, background: brandOrg ? `linear-gradient(160deg, ${primary}22 0%, #000000 100%)` : `linear-gradient(160deg, #1a1200 0%, #000000 100%)`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40, borderRight:`1px solid #1a1a1a`, minWidth:0 }}>
          {brandOrg ? <OrgLogo org={brandOrg} size={110}/> : <EdenLogo size={110}/>}
          <h1 style={{ fontSize:32, fontWeight:800, color:"#ffffff", margin:"24px 0 8px", textAlign:"center", lineHeight:1.2 }}>
            {brandOrg ? brandOrg.name : <>Eden<br/>Communications</>}
          </h1>
          <p style={{ fontSize:14, color:"#888888", margin:"0 0 32px", textAlign:"center", lineHeight:1.6 }}>
            {brandOrg ? <>The private platform for<br/>{brandOrg.name}</> : <>The private platform for<br/>Lifestyle of Eden University</>}
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:10, width:"100%", maxWidth:260 }}>
            {["🔒 Encrypted in transit & at rest","🛡 Private, encrypted messaging","📊 Full client management","🍽 Diet builder + macro tracking"].map(f => (
              <div key={f} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:`${primary}11`, borderRadius:8, border:`1px solid ${primary}22` }}>
                <span style={{ fontSize:12, color:"#cccccc" }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Login form */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding: isMobile ? "24px 20px 40px" : 40, minWidth:0 }}>
        <div style={{ width:"100%", maxWidth:400 }}>
          <h2 style={{ fontSize:24, fontWeight:700, color:"#ffffff", margin:"0 0 6px" }}>Sign In</h2>
          <p style={{ fontSize:13, color:"#888888", margin:"0 0 28px" }}>Welcome back. Enter your credentials below.</p>

          <Card>
            <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com"
              icon={<Ic n="mail" size={16} c={B.muted}/>}/>
            <Input label="Password" type={showPass?"text":"password"} value={pass} onChange={setPass} placeholder="••••••••••••"
              icon={<Ic n="lock" size={16} c={B.muted}/>}
              rightIcon={<Ic n={showPass?"eyeoff":"eye"} size={16} c={B.muted}/>}
              onRightClick={()=>setShowPass(!showPass)}
              error={error}/>
            <button onClick={onForgot} style={{ background:"none", border:"none", cursor:"pointer", color:primary, fontSize:12, padding:0, marginBottom:20, display:"block", textAlign:"right", width:"100%" }}>
              Forgot password?
            </button>
            <Btn onClick={submit} fullWidth disabled={loading}
              style={brandOrg ? { background:`linear-gradient(135deg, ${secondary}, ${primary})`, color:"#000000" } : undefined}>
              {loading ? "Signing in…" : "Sign In →"}
            </Btn>
          </Card>

          <p style={{ textAlign:"center", fontSize:10, color:"#444444", marginTop:20, lineHeight:1.6 }}>
            {brandOrg ? "🔒 All data encrypted" : "🔒 All data encrypted · edencommunications.io"}
          </p>
        </div>
      </div>
    </div>
  );
};

// FORGOT PASSWORD — sends a real Supabase Auth recovery email
const ForgotScreen = ({ onBack }) => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const sendReset = async () => {
    setErr(""); setSending(true);
    try {
      // Branded reset email sent by our API server (org name + styling),
      // instead of Supabase's generic template.
      const r = await fetch('/api/auth/reset-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErr(j.error || "Could not send the reset email — please try again."); setSending(false); return; }
      setSent(true);
    } catch {
      setErr("Could not send the reset email — please check your connection and try again.");
    }
    setSending(false);
  };
  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(160deg, #1a1a00 0%, #000000 50%, #0d0800 100%)`, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:520 }}>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", marginBottom:32 }}>
          <HoneycombLogo size={56}/>
          <h1 style={{ fontSize:22, fontWeight:700, color:B.text, margin:"12px 0 0" }}>Reset Password</h1>
        </div>
        <Card>
          {!sent ? (
            <>
              <p style={{ fontSize:13, color:B.muted, marginBottom:20, lineHeight:1.6 }}>Enter the email address on your account and we will send you a secure reset link.</p>
              <Input label="Email Address" type="email" value={email} onChange={setEmail} placeholder="you@example.com" icon={<Ic n="mail" size={16} c={B.muted}/>} error={err}/>
              <Btn onClick={sendReset} fullWidth disabled={!email || sending}>{sending ? "Sending…" : "Send Reset Link"}</Btn>
            </>
          ) : (
            <div style={{ textAlign:"center", padding:"12px 0" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>✉️</div>
              <h3 style={{ color:B.text, fontSize:16, marginBottom:8 }}>Check your inbox</h3>
              <p style={{ fontSize:13, color:B.muted, lineHeight:1.6 }}>If an account exists for <strong style={{ color:B.text }}>{email}</strong>, a password reset link is on its way. The link expires after a short time — use it soon.</p>
            </div>
          )}
        </Card>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:B.muted, fontSize:13, marginTop:20, display:"block", margin:"20px auto 0" }}>← Back to Sign In</button>
      </div>
    </div>
  );
};

// SET PASSWORD — shared by the first-login "set your own password" prompt
// (mode="first") and the emailed reset-link landing (mode="recovery").
// Requires an active Supabase Auth session (sign-in or recovery link).
const SetPasswordScreen = ({ mode, onDone, onCancel }) => {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setErr("");
    if (pw1.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (pw1 !== pw2) { setErr("Passwords do not match."); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({
      password: pw1,
      data: { must_change_password: false },
    });
    setSaving(false);
    if (error) {
      setErr(/same.*password|different from the old/i.test(error.message || "")
        ? "New password must be different from your current one."
        : (error.message || "Could not update your password — please try again."));
      return;
    }
    onDone();
  };
  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(160deg, #1a1a00 0%, #000000 50%, #0d0800 100%)`, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:520 }}>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", marginBottom:28 }}>
          <HoneycombLogo size={56}/>
          <h1 style={{ fontSize:22, fontWeight:700, color:B.text, margin:"12px 0 4px" }}>
            {mode === "recovery" ? "Choose a New Password" : "Set Your Password"}
          </h1>
          <p style={{ fontSize:12, color:B.muted, textAlign:"center" }}>
            {mode === "recovery"
              ? "Enter a new password for your account."
              : "For your security, replace the temporary password with one only you know."}
          </p>
        </div>
        <Card>
          <Input label="New Password" type={show?"text":"password"} value={pw1} onChange={setPw1} placeholder="At least 8 characters"
            icon={<Ic n="lock" size={16} c={B.muted}/>}
            rightIcon={<Ic n={show?"eyeoff":"eye"} size={16} c={B.muted}/>} onRightClick={()=>setShow(!show)}/>
          <Input label="Confirm New Password" type={show?"text":"password"} value={pw2} onChange={setPw2} placeholder="Repeat it"
            icon={<Ic n="lock" size={16} c={B.muted}/>} error={err}/>
          <Btn onClick={save} fullWidth disabled={saving || !pw1 || !pw2}>{saving ? "Saving…" : "Save Password"}</Btn>
        </Card>
        {onCancel && (
          <button onClick={onCancel} style={{ background:"none", border:"none", cursor:"pointer", color:B.muted, fontSize:13, display:"block", margin:"20px auto 0" }}>← Back to Sign In</button>
        )}
      </div>
    </div>
  );
};

// CHANGE PASSWORD — small modal available from the app header once signed in
// through real auth (demo accounts have no auth session, so it's hidden).
const ChangePasswordModal = ({ onClose }) => {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setErr("");
    if (pw1.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (pw1 !== pw2) { setErr("Passwords do not match."); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw1, data: { must_change_password: false } });
    setSaving(false);
    if (error) {
      setErr(/same.*password|different from the old/i.test(error.message || "")
        ? "New password must be different from your current one."
        : (error.message || "Could not update your password — please try again."));
      return;
    }
    setOk(true);
  };
  return (
    <div onClick={e=>{ if (e.target === e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000, padding:16 }}>
      <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, width:"100%", maxWidth:420, padding:24 }}>
        <h3 style={{ fontSize:16, fontWeight:700, color:B.text, margin:"0 0 16px" }}>Change Password</h3>
        {ok ? (
          <>
            <p style={{ fontSize:13, color:B.success, margin:"0 0 16px" }}>✓ Your password has been updated.</p>
            <Btn onClick={onClose} fullWidth>Done</Btn>
          </>
        ) : (
          <>
            <Input label="New Password" type={show?"text":"password"} value={pw1} onChange={setPw1} placeholder="At least 8 characters"
              icon={<Ic n="lock" size={16} c={B.muted}/>}
              rightIcon={<Ic n={show?"eyeoff":"eye"} size={16} c={B.muted}/>} onRightClick={()=>setShow(!show)}/>
            <Input label="Confirm New Password" type={show?"text":"password"} value={pw2} onChange={setPw2} placeholder="Repeat it"
              icon={<Ic n="lock" size={16} c={B.muted}/>} error={err}/>
            <div style={{ display:"flex", gap:10 }}>
              <Btn onClick={onClose} variant="secondary" style={{ flex:1 }}>Cancel</Btn>
              <Btn onClick={save} disabled={saving || !pw1 || !pw2} style={{ flex:1 }}>{saving ? "Saving…" : "Save"}</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── DASHBOARD SCREENS ────────────────────────────────────────────────────────

const HomeScreen = ({ user, wlOrg = null }) => {
  const homeDeadline = useDeadline(user?.email);
  // Upcoming start date — countdown card for clients who haven't started yet
  const [startInfo, setStartInfo] = useState<any>(null); // { startDate, coachName }
  useEffect(() => { (async () => {
    try {
      if (!user?.email || user.role !== 'client') { setStartInfo(null); return; }
      const rows = await csGet('user_profiles', `email=eq.${encodeURIComponent(user.email)}&select=start_date,coach_id`);
      const sd = rows?.[0]?.start_date ? String(rows[0].start_date).slice(0, 10) : null;
      if (!sd) { setStartInfo(null); return; }
      // Business timezone (matches the server reminder job), not browser tz
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
      if (sd < today) { setStartInfo(null); return; }   // already started
      let coachName = '';
      if (rows[0].coach_id) {
        const co = await csGet('user_profiles', `id=eq.${rows[0].coach_id}&select=name`);
        coachName = co?.[0]?.name || '';
      }
      setStartInfo({ startDate: sd, coachName });
    } catch { setStartInfo(null); }
  })(); }, [user?.email, user?.role]);
  // White-label palette — falls back to Eden gold when no wl org
  const hp = wlPalette(wlOrg);
  const primary   = wlOrg ? hp.primary   : B.gold;
  const secondary = wlOrg ? hp.secondary : "#ffa600";
  const accent    = wlOrg ? hp.accent    : B.gold;
  const hasPalette = wlOrg && hp.extra.length > 0;
  return (
    <Screen>
      {/* Header */}
      <div style={{ background: wlOrg ? `linear-gradient(180deg, ${primary}22 0%, #000000 100%)` : `linear-gradient(180deg, #1a1200 0%, #000000 100%)`, padding:"28px 20px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4, gap:8 }}>
          <div style={{ minWidth:0 }}>
            <p style={{ fontSize:11, color:B.muted, fontWeight:700, letterSpacing:1, textTransform:"uppercase", margin:"0 0 4px" }}>Welcome back</p>
            <h1 style={{ fontSize:22, fontWeight:700, color:B.text, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.name}</h1>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
            <Badge color={primary}>{user.role.replace("_"," ")}</Badge>
            <div style={{ width:42, height:42, borderRadius:21, background:`linear-gradient(135deg,${primary},${secondary})`, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:16, fontWeight:700, color:"#fff" }}>{user.name[0]}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Start-date countdown — shown until the client's program begins */}
      {startInfo && (() => {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
        const days = Math.round((Date.parse(startInfo.startDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
        if (days < 0) return null;   // program already started — hide mid-session too
        const nice = new Date(startInfo.startDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', timeZone:'UTC' });
        const isToday = days === 0;
        return (
          <div style={{ margin:"16px 20px 0", background: hasPalette ? `linear-gradient(135deg, ${primary}1e, ${secondary}14)` : `linear-gradient(135deg, ${primary}1e, ${B.card})`, border:`1px solid ${hasPalette ? accent : primary}55`, borderRadius:12, padding:"16px 18px", textAlign:"center" }}>
            <p style={{ fontSize:11, fontWeight:700, color:primary, letterSpacing:1, textTransform:"uppercase", margin:"0 0 6px" }}>
              {isToday ? "🎉 Today's the Day!" : "🚀 Your Program Starts Soon"}
            </p>
            {isToday ? (
              <p style={{ fontSize:14, color:B.text, margin:0, lineHeight:1.6 }}>
                Your program officially starts <strong style={{ color:primary }}>today</strong>{startInfo.coachName ? <> with coach <strong>{startInfo.coachName}</strong></> : null} — let's go!
              </p>
            ) : (
              <>
                <p style={{ fontSize:26, fontWeight:800, color:primary, margin:"0 0 2px" }}>{days} {days === 1 ? "day" : "days"} to go</p>
                <p style={{ fontSize:13, color:B.text, margin:0, lineHeight:1.6 }}>
                  You start <strong>{nice}</strong>{startInfo.coachName ? <> with coach <strong>{startInfo.coachName}</strong></> : null}. We'll remind you as it gets close.
                </p>
              </>
            )}
          </div>
        );
      })()}

      {/* Announcement banner */}
      <div style={{ margin:"16px 20px 0", background:B.card, border:`1px solid ${primary}33`, borderLeft:`3px solid ${secondary}`, borderRadius:10, padding:"12px 14px" }}>
        <p style={{ fontSize:11, fontWeight:700, color:secondary, margin:"0 0 3px", letterSpacing:0.8 }}>COACH UPDATE</p>
        <p style={{ fontSize:13, color:B.text, margin:0 }}>Your weekly check-in is due before {homeDeadline.text} on your assigned update day. Remember to take your morning weight fasted.</p>
      </div>

      {/* This week */}
      <div style={{ padding:"20px 20px 0" }}>
        <p style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 12px" }}>This Week</p>
        {[
          { label:"Habit Tracker", status:"3/7 days", color:B.gold },
          { label:"Weekly Check-In", status:"Due Wednesday", color:"#ffa600" },
          { label:"Diet Adherence", status:"On track", color:B.success },
        ].map(({ label, status, color }, i) => {
          // White-label orgs: badges use the single primary brand color
          if (hasPalette) color = hp.primary;
          return (
          <div key={label} style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:10, padding:"12px 14px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, color:B.text, fontWeight:500 }}>{label}</span>
            <Badge color={color}>{status}</Badge>
          </div>
        );})}
      </div>

      {/* Resources links */}
      <div style={{ padding:"20px 20px 32px" }}>
        <p style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 12px" }}>Lifestyle of Eden University</p>
        {[
          { label:"🎙 Pillars Podcast", url:"https://open.spotify.com/show/0hEI4GF66eXXMSxlgmbVUP" },
          { label:"📺 YouTube Channel", url:"https://www.youtube.com/@lifestyleofeden3879" },
          { label:"📸 Instagram",       url:"https://www.instagram.com/nicktofficial/" },
          { label:"👥 Facebook Page",   url:"https://www.facebook.com/profile.php?id=61587350518067" },
          { label:"🌐 Website",         url:"https://lifestyleofeden.com" },
          { label:"🛍 Eden Clothing",   url:"https://lifestyle-of-eden.myshopify.com/" },
        ].map(({ label, url }) => (
          <a key={label} href={url} target="_blank" rel="noopener noreferrer"
            style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:B.card, border:`1px solid ${B.border}`, borderRadius:10, padding:"12px 14px", marginBottom:8, textDecoration:"none" }}>
            <span style={{ fontSize:13, color:B.text }}>{label}</span>
            <span style={{ color:B.gold, fontSize:14 }}>→</span>
          </a>
        ))}
      </div>
    </Screen>
  );
};

// ─── COMMUNITY / CONNECT SCREEN ──────────────────────────────────────────────
const CS_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co';
const CS_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU';
const CS_H    = { 'apikey':CS_ANON, get Authorization(){ return sbBearer() }, 'Content-Type':'application/json', 'Prefer':'return=representation' };
async function csGet(table:string, q='') { try { const r=await fetch(`${CS_URL}/rest/v1/${table}?${q}`,{headers:CS_H}); return r.ok?r.json():[] } catch { return [] } }
async function csSave(table:string, body:any, id?:string) {
  const url = id ? `${CS_URL}/rest/v1/${table}?id=eq.${id}` : `${CS_URL}/rest/v1/${table}`;
  try { const r=await fetch(url,{method:id?'PATCH':'POST',headers:CS_H,body:JSON.stringify(body)}); const t=await r.text(); return t?JSON.parse(t):null } catch { return null }
}

const DEFAULT_SOCIALS = [
  { emoji:"🎙", label:"Spotify Podcast", sub:"Full show · all episodes",  url:"https://open.spotify.com/show/0hEI4GF66eXXMSxlgmbVUP",  accent:"#1DB954", bg:"#1DB95418" },
  { emoji:"📺", label:"YouTube",         sub:"@lifestyleofeden3879",       url:"https://www.youtube.com/@lifestyleofeden3879",            accent:"#FF0000", bg:"#FF000018" },
  { emoji:"📸", label:"Instagram",       sub:"@nicktofficial",             url:"https://www.instagram.com/nicktofficial/",                accent:"#E1306C", bg:"#E1306C18" },
  { emoji:"👥", label:"Facebook",        sub:"Lifestyle of Eden University Page",     url:"https://www.facebook.com/profile.php?id=61587350518067",  accent:"#1877F2", bg:"#1877F218" },
  { emoji:"🌐", label:"Website",         sub:"lifestyleofeden.com",        url:"https://lifestyleofeden.com",                            accent:B.gold,    bg:`${B.gold}18` },
  { emoji:"🛍", label:"Eden Clothing",   sub:"Shop the brand",             url:"https://lifestyle-of-eden.myshopify.com/",               accent:B.gold,    bg:`${B.gold}18` },
];

const EDEN_ORG_ID = 'b0000000-0000-0000-0000-000000000001';
// Starter links a white-label admin sees before customizing their Connect space
const WL_PLACEHOLDER_SOCIALS = [
  { emoji:"🌐", label:"Website",   sub:"Add your website link",   url:"", accent:"#ffa600", bg:"#ffa60018" },
  { emoji:"📸", label:"Instagram", sub:"Add your Instagram",      url:"", accent:"#E1306C", bg:"#E1306C18" },
  { emoji:"👥", label:"Facebook",  sub:"Add your Facebook page",  url:"", accent:"#1877F2", bg:"#1877F218" },
  { emoji:"📺", label:"YouTube",   sub:"Add your YouTube",        url:"", accent:"#FF0000", bg:"#FF000018" },
  { emoji:"📅", label:"Book a Call", sub:"Add your booking link", url:"", accent:"#4FD89A", bg:"#4FD89A18" },
  { emoji:"🎙", label:"Podcast",   sub:"Add your podcast link",   url:"", accent:"#1DB954", bg:"#1DB95418" },
];

const CommunityScreen = ({ user }:any) => {
  const isAdmin  = user?.role === 'super_admin';
  const isCoach  = user?.role === 'coach';

  // White-label company context: null = Lifestyle of Eden (default experience)
  const [myCompany, setMyCompany] = useState<any>(null);

  const PILLARS = [
    { n:"1 · Nutrition",                   url:"https://open.spotify.com/episode/1AvDa6x3tU9jORoGSxMdBL?si=hzNiIFHcQIqoYaC5H-TrVg&nd=1&dlsi=e7f414423b2140dd" },
    { n:"2 · Community & Stress",          url:"https://open.spotify.com/episode/7D7p0ma4hRq0n8AGExlDaY?si=o6qTlhF6RPm7HgrleNmnHw&nd=1&dlsi=c794e85544654521" },
    { n:"3 · Body Movement",               url:"https://open.spotify.com/episode/3T27X1cjSLkUZYQR7LftSS?si=s2oiqD5sT-W3gtFXHhG5PQ&nd=1&dlsi=9e1e0cf95bf14975" },
    { n:"4 · Hydration",                   url:"https://open.spotify.com/episode/06XavfNu9UUlRSOnS5HKmV?si=QHnRycwEQPWwaiovb_oLRA&nd=1&dlsi=4d3714cdaedc4a22" },
    { n:"5 · Oxygenation",                 url:"https://open.spotify.com/episode/3rGThSvLTAE4bcD5P7BUEL?si=Mi2I4u7GRx2OeDSubE8lVA&nd=1&dlsi=15551fba2f06436b" },
    { n:"6 · Autophagy / mTOR Balance",    url:"https://open.spotify.com/episode/2TARseWW2DXvi9JJ8J4wZa?si=3OQxs1AJQeeikjfsE9VGUw&nd=1&dlsi=8c1cece953ca41d2" },
    { n:"7 · Sleep & Circadian Alignment", url:"https://open.spotify.com/episode/3HndjaiJHVctnn3uXuvb4J?si=dSpzHtIDRfWqduVASsWpiw&nd=1&dlsi=25e8f1d81d414c9c" },
  ];

  // Admin picks which coach to edit; everyone else resolves their own coach
  const [coachList,     setCoachList]     = useState<any[]>([]);
  const [pickedCoachId, setPickedCoachId] = useState<string>('');  // admin's selected coach
  const [myCoachId,     setMyCoachId]     = useState<string>('');  // coach/client resolved UUID

  // Links state
  const [socials, setSocials] = useState<any[]>(DEFAULT_SOCIALS);
  const [rowId,   setRowId]   = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState<any[]>(DEFAULT_SOCIALS);

  // Step 1: resolve identity + company (white-label users get their own Connect space)
  useEffect(()=>{ (async () => {
    const rows:any[] = await csGet('user_profiles',`email=eq.${encodeURIComponent(user?.email||'')}&select=id,company_id`);
    const myId = rows?.[0]?.id;
    const cid  = rows?.[0]?.company_id;
    if (cid && cid !== EDEN_ORG_ID) {
      const org:any[] = await csGet('organizations',`id=eq.${cid}&select=id,name,brand_color,calendar_url`);
      if (org?.[0]) {
        let row = org[0];
        // Palette column added later — fetch separately so a missing column can't break primary branding
        const pal:any[] = await csGet('organizations',`id=eq.${cid}&select=brand_colors&limit=1`);
        if (Array.isArray(pal?.[0]?.brand_colors)) row = { ...row, brand_colors: pal[0].brand_colors };
        setMyCompany(row); return; // white-label: company links, no coach logic
      }
    }
    if (isAdmin) {
      csGet('user_profiles','role=in.(coach,head_coach)&select=id,name&order=name.asc').then((rows2:any[])=>{
        setCoachList(rows2||[]);
        if (rows2?.[0]?.id) setPickedCoachId(rows2[0].id);
      });
    } else if (isCoach) {
      if (myId) setMyCoachId(myId);
    } else if (myId) {
      const ca:any[] = await csGet('client_access',`client_id=eq.${myId}&select=staff_id&limit=1`);
      if (ca?.[0]?.staff_id) setMyCoachId(ca[0].staff_id);
    }
  })() },[user?.email]);

  // Step 2: load links — company links for white-label users, coach links otherwise
  const activeCoachId = isAdmin ? pickedCoachId : myCoachId;
  useEffect(()=>{
    if (myCompany) {
      setEditing(false);
      csGet('company_links',`company_id=eq.${myCompany.id}&limit=1`).then((rows:any[])=>{
        if (rows?.[0]?.links?.length) {
          setSocials(rows[0].links); setDraft(rows[0].links); setRowId(rows[0].id);
        } else {
          setSocials(WL_PLACEHOLDER_SOCIALS); setDraft(WL_PLACEHOLDER_SOCIALS); setRowId('');
        }
      });
      return;
    }
    if (!activeCoachId) return;
    setEditing(false);
    csGet('coach_social_links',`coach_id=eq.${activeCoachId}&limit=1`).then((rows:any[])=>{
      if (rows?.[0]?.links?.length) {
        setSocials(rows[0].links); setDraft(rows[0].links); setRowId(rows[0].id);
      } else {
        setSocials(DEFAULT_SOCIALS); setDraft(DEFAULT_SOCIALS); setRowId('');
      }
    });
  },[activeCoachId, myCompany?.id]);

  const updateDraft = (i:number, field:string, val:string) =>
    setDraft(prev=>prev.map((s:any,idx:number)=>idx===i?{...s,[field]:val}:s));

  const saveLinks = async () => {
    setSocials(draft); setEditing(false);
    if (myCompany) {
      if (rowId) {
        await csSave('company_links',{links:draft,updated_at:new Date().toISOString()},rowId);
      } else {
        const res:any = await csSave('company_links',{company_id:myCompany.id,links:draft});
        if (res?.[0]?.id) setRowId(res[0].id);
      }
      return;
    }
    if (!activeCoachId) return;
    if (rowId) {
      await csSave('coach_social_links',{links:draft,updated_at:new Date().toISOString()},rowId);
    } else {
      const res:any = await csSave('coach_social_links',{coach_id:activeCoachId,links:draft});
      if (res?.[0]?.id) setRowId(res[0].id);
    }
  };

  return (
    <Screen>
      {/* Hero */}
      <div style={{ background:"linear-gradient(180deg,#1a1200 0%,#000 100%)", padding:"24px 20px 20px" }}>
        <p style={{ fontSize:11, fontWeight:700, color:myCompany?.brand_color||B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 4px" }}>{myCompany?.name||'Lifestyle of Eden University'}</p>
        <h1 style={{ fontSize:22, fontWeight:800, color:B.text, margin:"0 0 4px" }}>Connect</h1>
        <p style={{ fontSize:12, color:B.muted, margin:0 }}>
          {myCompany ? 'Your community links — all in one place' : 'Podcast · social media · shop — all in one place'}
        </p>
      </div>

      {/* Admin: coach picker */}
      {!myCompany && isAdmin && coachList.length > 0 && (
        <div style={{ padding:"12px 20px 0" }}>
          <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 6px" }}>Editing links for coach</p>
          <select value={pickedCoachId} onChange={e=>{ setPickedCoachId(e.target.value); setEditing(false); }}
            style={{ width:"100%", background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"9px 12px", color:B.text, fontSize:13, outline:"none", cursor:"pointer" }}>
            {coachList.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Social platform cards */}
      <div style={{ padding:"16px 20px 0" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
          <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:0 }}>Follow &amp; Subscribe</p>
          {isAdmin && !editing && (
            <button onClick={()=>{ setDraft(socials); setEditing(true); }}
              style={{ background:"none", border:`1px solid ${B.border}`, borderRadius:6, padding:"3px 10px", color:B.gold, fontSize:11, fontWeight:700, cursor:"pointer" }}>
              ✏️ Edit Links
            </button>
          )}
        </div>

        {/* Admin inline editor */}
        {editing && isAdmin && (
          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:16, marginBottom:14 }}>
            <p style={{ fontSize:11, fontWeight:700, color:B.gold, margin:"0 0 4px" }}>
              Edit links — {myCompany ? myCompany.name : (coachList.find((c:any)=>c.id===pickedCoachId)?.name||'Coach')}
            </p>
            <p style={{ fontSize:10, color:B.muted, margin:"0 0 12px" }}>
              {myCompany ? 'These links appear for everyone in your company. Set the label, handle, and URL for each.' : 'Eden defaults pre-filled. Change any field and save.'}
            </p>
            {draft.map((s:any, i:number) => (
              <div key={i} style={{ borderBottom:`1px solid ${B.border}`, paddingBottom:12, marginBottom:12 }}>
                <div style={{ display:"flex", gap:8, marginBottom:6 }}>
                  <input value={s.emoji} onChange={e=>updateDraft(i,'emoji',e.target.value)}
                    style={{ width:44, background:B.surface, border:`1px solid ${B.border}`, borderRadius:6, padding:"6px", color:B.text, fontSize:16, textAlign:"center", outline:"none" }}/>
                  <input value={s.label} onChange={e=>updateDraft(i,'label',e.target.value)}
                    placeholder="Label" style={{ flex:1, background:B.surface, border:`1px solid ${B.border}`, borderRadius:6, padding:"6px 10px", color:B.text, fontSize:13, outline:"none" }}/>
                </div>
                <input value={s.sub} onChange={e=>updateDraft(i,'sub',e.target.value)}
                  placeholder="Handle / subtitle" style={{ width:"100%", background:B.surface, border:`1px solid ${B.border}`, borderRadius:6, padding:"6px 10px", color:B.text, fontSize:12, outline:"none", boxSizing:"border-box" as any, marginBottom:6 }}/>
                <input value={s.url} onChange={e=>updateDraft(i,'url',e.target.value)}
                  placeholder="https://…" style={{ width:"100%", background:B.surface, border:`1px solid ${B.border}`, borderRadius:6, padding:"6px 10px", color:B.text, fontSize:12, outline:"none", boxSizing:"border-box" as any }}/>
              </div>
            ))}
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setEditing(false)}
                style={{ flex:1, background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"9px", color:B.muted, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                Cancel
              </button>
              <button onClick={saveLinks}
                style={{ flex:2, background:B.gold, border:"none", borderRadius:8, padding:"9px", fontWeight:800, color:"#000", fontSize:12, cursor:"pointer" }}>
                Save {myCompany ? `for ${myCompany.name}` : `for ${coachList.find((c:any)=>c.id===pickedCoachId)?.name?.split(' ')[0]||'Coach'}`}
              </button>
            </div>
          </div>
        )}

        {myCompany && !isAdmin && socials.every((s:any)=>!s.url) && (
          <p style={{ fontSize:12, color:B.muted, margin:"0 0 12px" }}>Your community links are coming soon — your team is setting them up.</p>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {socials.filter((s:any)=> s.url || isAdmin).map(({ emoji, label, sub, url, accent, bg }:any, i:number) => {
            // White-label: the org's primary brand color always wins over stored
            // per-link colors so cards feel branded without cycling extra colors.
            const cardAccent = myCompany ? wlPalette(myCompany).primary : (accent || B.gold);
            const cardBg     = myCompany ? `${cardAccent}18` : (bg || `${cardAccent}18`);
            return (
            <a key={label} href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
              <div style={{ background:cardBg, border:`1px solid ${cardAccent}44`, borderRadius:14, padding:"14px 12px", display:"flex", flexDirection:"column", gap:6, height:"100%", boxSizing:"border-box" }}>
                <span style={{ fontSize:24 }}>{emoji}</span>
                <div>
                  <p style={{ fontSize:13, fontWeight:700, color:B.text, margin:"0 0 2px" }}>{label}</p>
                  <p style={{ fontSize:10, color:B.muted, margin:0, lineHeight:1.4 }}>{sub}</p>
                </div>
                <span style={{ fontSize:11, color:cardAccent, fontWeight:700, marginTop:"auto" }}>Open →</span>
              </div>
            </a>
          );})}
        </div>
      </div>

      {/* 7 Pillars episodes — Eden experience only */}
      {!myCompany && (
      <div style={{ padding:"20px 20px 32px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
          <span style={{ fontSize:16 }}>🎧</span>
          <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:0 }}>The 7 Pillars — Podcast Episodes</p>
        </div>
        <div style={{ background:B.card, border:`1px solid #1DB95444`, borderRadius:14, overflow:"hidden" }}>
          {PILLARS.map(({ n, url }, i) => (
            <a key={n} href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 14px",
                borderBottom: i < PILLARS.length - 1 ? `1px solid ${B.border}` : "none" }}
                onMouseEnter={e=>(e.currentTarget.style.background=`#1DB95410`)}
                onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:"#1DB95422", border:"1px solid #1DB95444", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span style={{ fontSize:12 }}>▶</span>
                  </div>
                  <span style={{ fontSize:13, color:B.text, fontWeight:500 }}>Pillar {n}</span>
                </div>
                <span style={{ fontSize:11, color:"#1DB954", fontWeight:700, flexShrink:0, marginLeft:8 }}>Listen →</span>
              </div>
            </a>
          ))}
        </div>
      </div>
      )}

      {/* White-label: booking calendar */}
      {myCompany?.calendar_url && (() => { const wpc = wlPalette(myCompany); return (
        <div style={{ padding:"20px 20px 32px" }}>
          <a href={myCompany.calendar_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
            <div style={{ background:`linear-gradient(135deg, ${wpc.primary}15, ${wpc.secondary}15)`, border:`1px solid ${wpc.accent}44`, borderRadius:14, padding:"16px", display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:24 }}>📅</span>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:13, fontWeight:700, color:B.text, margin:"0 0 2px" }}>Book a Call</p>
                <p style={{ fontSize:11, color:B.muted, margin:0 }}>Schedule time with your coach</p>
              </div>
              <span style={{ fontSize:12, color:wpc.secondary, fontWeight:700 }}>Open →</span>
            </div>
          </a>
        </div>
      ); })()}
    </Screen>
  );
};

const MessagesScreen = () => {
  const [msg, setMsg] = useState("");
  const [messages, setMessages] = useState([
    { id:1, from:"coach", text:"Good morning! How are you feeling after this week's protocol?", time:"Mon 8:12 AM" },
    { id:2, from:"client", text:"Feeling great! Sleep has improved a lot. Energy is up.", time:"Mon 9:04 AM" },
    { id:3, from:"coach", text:"That's exactly what we want to see. Keep hitting that daily step goal. Your check-in is due Wednesday before 9 AM CST — don't forget your fasted weight and photos.", time:"Mon 9:15 AM" },
  ]);
  const send = () => {
    if (!msg.trim()) return;
    setMessages(m=>[...m,{id:Date.now(),from:"client",text:msg,time:"Just now"}]);
    setMsg("");
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <PageHeader title="Messages" subtitle="Your coach · Private & encrypted"/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
        {messages.map(m=>(
          <div key={m.id} style={{ display:"flex", justifyContent:m.from==="client"?"flex-end":"flex-start", marginBottom:12 }}>
            <div style={{ maxWidth:"78%", background:m.from==="client"?`linear-gradient(135deg,${B.gold},${"#ffa600"})`:B.card, border:m.from==="client"?"none":`1px solid ${B.border}`, borderRadius:14, padding:"10px 14px" }}>
              <p style={{ fontSize:13, color:B.text, margin:"0 0 4px", lineHeight:1.5 }}>{m.text}</p>
              <p style={{ fontSize:10, color:m.from==="client"?"rgba(255,255,255,0.6)":B.muted, margin:0 }}>{m.time}</p>
            </div>
          </div>
        ))}
        <div style={{ marginTop:8, padding:"8px 12px", background:B.card, border:`1px solid ${B.gold}33`, borderRadius:10 }}>
          <p style={{ fontSize:10, color:B.muted, margin:0 }}>🔒 All messages are end-to-end encrypted and confidential</p>
        </div>
      </div>
      <div style={{ padding:"12px 20px 16px", background:B.surface, borderTop:`1px solid ${B.border}` }}>
        <div style={{ display:"flex", gap:10 }}>
          <input value={msg} onChange={e=>setMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Message your coach…"
            style={{ flex:1, background:B.card, border:`1px solid ${B.border}`, borderRadius:10, padding:"11px 14px", color:B.text, fontSize:13, outline:"none", fontFamily:"inherit" }}/>
          <Btn onClick={send} disabled={!msg.trim()} style={{padding:"11px 18px"}}>Send</Btn>
        </div>
      </div>
    </div>
  );
};

const DietScreen = () => {
  const isMobile = useIsMobile();
  const meals = [
    { name:"Meal 1", foods:[{name:"Organic Egg Whites (184g)",cal:80,pro:18,fat:0,carb:0,fib:0},{name:"Oatmeal dry (40g)",cal:150,pro:5,fat:3,carb:27,fib:4},{name:"Mixed Berries (100g)",cal:55,pro:0.8,fat:0.3,carb:12,fib:2.5}]},
    { name:"Meal 2", foods:[{name:"Chicken Breast (4oz)",cal:120,pro:21,fat:4,carb:0,fib:0},{name:"Brown Rice (195g)",cal:218,pro:4.5,fat:1.6,carb:45,fib:3.5},{name:"Green Beans (100g)",cal:31,pro:2.1,fat:0.4,carb:3.1,fib:2.7}]},
    { name:"Meal 3", foods:[{name:"Wild Caught Salmon (4oz)",cal:237,pro:28.7,fat:13.6,carb:0,fib:0},{name:"Broccoli (100g)",cal:38,pro:4.4,fat:0.9,carb:1.8,fib:2.6},{name:"EVOO (14g)",cal:120,pro:0,fat:14,carb:0,fib:0}]},
  ];
  const totals = meals.flatMap(m=>m.foods).reduce((a,f)=>({cal:a.cal+f.cal,pro:a.pro+f.pro,fat:a.fat+f.fat,carb:a.carb+f.carb,fib:a.fib+f.fib}),{cal:0,pro:0,fat:0,carb:0,fib:0});
  const targets = {cal:2100,pro:175,fat:70,carb:200,fib:30};

  return (
    <Screen>
      <PageHeader title="Diet Plan" subtitle="High Calorie Day · Base Protocol"/>
      <div style={{ padding:"16px 20px" }}>
        {/* Macro summary */}
        <Card style={{ marginBottom:16 }}>
          <p style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 14px" }}>Daily Totals</p>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr 1fr" : "1fr 1fr 1fr 1fr 1fr", gap:8 }}>
            {[
              {label:"Calories",val:totals.cal,target:targets.cal,unit:"",color:B.gold},
              {label:"Protein",val:Math.round(totals.pro),target:targets.pro,unit:"g",color:"#4FD89A"},
              {label:"Carbs",val:Math.round(totals.carb),target:targets.carb,unit:"g",color:"#6FB8E8"},
              {label:"Fats",val:Math.round(totals.fat),target:targets.fat,unit:"g",color:"#ffa600"},
              {label:"Fiber",val:Math.round(totals.fib),target:targets.fib,unit:"g",color:"#D4A8F0"},
            ].map(({label,val,target,unit,color})=>(
              <div key={label} style={{ textAlign:"center" }}>
                <p style={{ fontSize:16, fontWeight:700, color, margin:"0 0 2px" }}>{val}{unit}</p>
                <p style={{ fontSize:9, color:B.muted, margin:"0 0 6px" }}>/{target}{unit}</p>
                <div style={{ height:3, borderRadius:2, background:B.border }}>
                  <div style={{ height:"100%", borderRadius:2, background:color, width:`${Math.min(100,Math.round(val/target*100))}%` }}/>
                </div>
                <p style={{ fontSize:9, color:B.muted, margin:"4px 0 0" }}>{label}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Meals */}
        {meals.map(meal=>{
          const mt = meal.foods.reduce((a,f)=>({cal:a.cal+f.cal,pro:a.pro+f.pro,fat:a.fat+f.fat,carb:a.carb+f.carb,fib:a.fib+f.fib}),{cal:0,pro:0,fat:0,carb:0,fib:0});
          return (
            <Card key={meal.name} style={{ marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <h3 style={{ fontSize:14, fontWeight:700, color:B.text, margin:0 }}>{meal.name}</h3>
                <span style={{ fontSize:11, color:B.gold, fontWeight:600 }}>{Math.round(mt.cal)} cal</span>
              </div>
              {meal.foods.map((f,i)=>(
                <div key={i} style={{ padding:"8px 0", borderTop:`1px solid ${B.border}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                    <span style={{ fontSize:12, color:B.text, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
                    <span style={{ fontSize:11, color:B.muted, flexShrink:0 }}>{f.cal}cal</span>
                  </div>
                  <div style={{ display:"flex", gap:10, marginTop:3 }}>
                    {[["P",f.pro,"#4FD89A"],["C",f.carb,"#6FB8E8"],["F",f.fat,"#ffa600"],["Fib",f.fib,"#D4A8F0"]].map(([l,v,c])=>(
                      <span key={l} style={{ fontSize:10, color:c }}>{l}: {Math.round(v)}g</span>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ marginTop:10, padding:"8px 10px", background:B.surface, borderRadius:8, display:"flex", gap:12 }}>
                {[["P",mt.pro,"#4FD89A"],["C",mt.carb,"#6FB8E8"],["F",mt.fat,"#ffa600"],["Fib",mt.fib,"#D4A8F0"]].map(([l,v,c])=>(
                  <span key={l} style={{ fontSize:11, color:c, fontWeight:600 }}>{l}: {Math.round(v)}g</span>
                ))}
              </div>
            </Card>
          );
        })}

        {/* Notes */}
        <Card style={{ marginBottom:12 }}>
          <p style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 10px" }}>Your Notes / Adjustments</p>
          <textarea placeholder="Log any adjustments you made this week…"
            style={{ width:"100%", background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"10px 12px", color:B.text, fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit", resize:"vertical", minHeight:80 }}/>
          <div style={{ marginTop:10 }}>
            <Btn variant="secondary" fullWidth>Save Notes</Btn>
          </div>
        </Card>

        {/* Recipe book upsell */}
        <div style={{ background:`linear-gradient(135deg, #111100, ${"#ffa600"})`, borderRadius:14, padding:16, marginBottom:32, border:`1px solid ${B.gold}33` }}>
          <p style={{ fontSize:13, fontWeight:700, color:B.text, margin:"0 0 6px" }}>🍽 Eden Recipe Book</p>
          <p style={{ fontSize:12, color:"rgba(255,255,255,0.7)", margin:"0 0 12px" }}>Unlock 100+ clean eating recipes and pull meals directly into your diet plan.</p>
          <Btn style={{ background:B.gold, color:B.black, padding:"10px 16px" }}>Unlock Recipe Book</Btn>
        </div>
      </div>
    </Screen>
  );
};

const LabsScreen = () => {
  const [tab, setTab] = useState("labs");
  const labs = [
    { date:"Jun 15 2025", type:"Blood Work", uploader:"Coach", notes:"TSH slightly elevated. Reviewing thyroid protocol.", files:["BloodWork_Jun2025.pdf"] },
    { date:"Apr 2 2025", type:"DUTCH Test", uploader:"Client", notes:"Cortisol pattern improved from last quarter.", files:["DUTCH_Apr2025.pdf"] },
    { date:"Feb 10 2025", type:"GI-MAP", uploader:"Coach", notes:"H. pylori negative. Continuing gut protocol.", files:["GIMAP_Feb2025.pdf"] },
  ];
  const photos = [
    { week:"Week 12", date:"Jul 6 2025", count:3 },
    { week:"Week 8",  date:"Jun 8 2025",  count:3 },
    { week:"Week 4",  date:"May 11 2025", count:3 },
    { week:"Week 1",  date:"Apr 20 2025", count:2 },
  ];
  return (
    <Screen>
      <PageHeader title="Labs & Photos" subtitle="Organized by date · Coach accessible"/>
      <div style={{ display:"flex", padding:"16px 20px 0", gap:8 }}>
        {["labs","photos"].map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{ flex:1, padding:"10px 0", borderRadius:10, border:`1px solid ${tab===t?B.gold:B.border}`, background:tab===t?`${B.gold}22`:B.card, color:tab===t?B.gold:B.muted, fontWeight:700, fontSize:12, cursor:"pointer", textTransform:"capitalize" }}>
            {t === "labs" ? "🧪 Lab Results" : "📸 Progress Photos"}
          </button>
        ))}
      </div>
      <div style={{ padding:"16px 20px" }}>
        {tab==="labs" ? (
          <>
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:12, padding:"12px 14px", marginBottom:14, display:"flex", alignItems:"center", gap:10 }}>
              <Ic n="upload" size={18} c={B.gold}/>
              <span style={{ fontSize:13, color:B.text }}>Upload New Lab Results</span>
              <span style={{ marginLeft:"auto", fontSize:20, color:B.gold }}>+</span>
            </div>
            {labs.map((l,i)=>(
              <Card key={i} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                  <div>
                    <Badge color={l.type==="Blood Work"?B.gold:l.type==="DUTCH Test"?"#D4A8F0":"#4FD89A"}>{l.type}</Badge>
                    <p style={{ fontSize:12, color:B.muted, margin:"6px 0 0" }}>{l.date} · Uploaded by {l.uploader}</p>
                  </div>
                </div>
                <p style={{ fontSize:13, color:B.text, margin:"0 0 10px", lineHeight:1.5 }}>{l.notes}</p>
                {l.files.map(f=>(
                  <div key={f} style={{ background:B.surface, borderRadius:8, padding:"8px 12px", display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:18, flexShrink:0 }}>📄</span>
                    <span style={{ fontSize:12, color:B.gold, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f}</span>
                    <span style={{ fontSize:12, color:B.muted, flexShrink:0 }}>View</span>
                  </div>
                ))}
              </Card>
            ))}
          </>
        ) : (
          <>
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:12, padding:"12px 14px", marginBottom:14, display:"flex", alignItems:"center", gap:10 }}>
              <Ic n="upload" size={18} c={B.gold}/>
              <span style={{ fontSize:13, color:B.text }}>Upload Progress Photos</span>
              <span style={{ marginLeft:"auto", fontSize:20, color:B.gold }}>+</span>
            </div>
            {photos.map((p,i)=>(
              <Card key={i} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div>
                    <p style={{ fontSize:14, fontWeight:700, color:B.text, margin:0 }}>{p.week}</p>
                    <p style={{ fontSize:11, color:B.muted, margin:"3px 0 0" }}>{p.date}</p>
                  </div>
                  <Badge color={B.gold}>{p.count} photos</Badge>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                  {Array(p.count).fill(0).map((_,j)=>(
                    <div key={j} style={{ aspectRatio:"3/4", background:B.surface, borderRadius:8, border:`1px solid ${B.border}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <Ic n="photos" size={20} c={B.muted}/>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </>
        )}
      </div>
    </Screen>
  );
};

const CheckInScreen = () => {
  const [form, setForm] = useState({ weight:"", temp:"", steps:"", heartRate:"", hrv:"", bloodPressure:"", sleep:"5", sleepWindow:"", sleepDisruption:"", sleepCycles:"", bloating:"5", brainFog:"5", sexDrive:"5", energy:"5", hunger:"5", stress:"5", mood:"", bowelCount:"", bowelType:"", notes:"" });
  const set = k => v => setForm(f=>({...f,[k]:v}));
  const Scale = ({ label, val, onChange }) => (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
        <label style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:0.8, textTransform:"uppercase" }}>{label}</label>
        <span style={{ fontSize:13, fontWeight:700, color:B.gold }}>{val}/10</span>
      </div>
      <input type="range" min="1" max="10" value={val} onChange={e=>onChange(e.target.value)}
        style={{ width:"100%", accentColor:B.gold }}/>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:2 }}>
        <span style={{ fontSize:9, color:B.muted }}>1 - Poor</span>
        <span style={{ fontSize:9, color:B.muted }}>10 - Excellent</span>
      </div>
    </div>
  );
  return (
    <Screen>
      <PageHeader title="Weekly Check-In" subtitle="Due Wednesday before 9 AM CST · Fasted"/>
      <div style={{ padding:"16px 20px 40px" }}>
        <div style={{ background:`${"#ffa600"}22`, border:`1px solid ${"#ffa600"}44`, borderRadius:10, padding:"10px 14px", marginBottom:16 }}>
          <p style={{ fontSize:12, color:"#ffa600", margin:0, fontWeight:600 }}>⚠️ Wake up on an empty stomach before submitting. Include fasted weight and upload photos.</p>
        </div>
        <Card style={{ marginBottom:12 }}>
          <p style={{ fontSize:12, fontWeight:700, color:B.gold, margin:"0 0 12px", letterSpacing:0.8 }}>VITALS</p>
          <Input label="Body Weight (lbs)" value={form.weight} onChange={set("weight")} placeholder="e.g. 172.4"/>
          <Input label="Body Temperature (°F)" value={form.temp} onChange={set("temp")} placeholder="e.g. 97.8"/>
          <Input label="Blood Pressure" value={form.bloodPressure} onChange={set("bloodPressure")} placeholder="e.g. 118/74"/>
          <Input label="Average Daily Steps" value={form.steps} onChange={set("steps")} placeholder="e.g. 9500"/>
          <Input label="Morning Resting Heart Rate (BPM)" value={form.heartRate} onChange={set("heartRate")} placeholder="e.g. 58"/>
          <Input label="HRV" value={form.hrv} onChange={set("hrv")} placeholder="e.g. 72"/>
        </Card>
        <Card style={{ marginBottom:12 }}>
          <p style={{ fontSize:12, fontWeight:700, color:B.gold, margin:"0 0 12px", letterSpacing:0.8 }}>SLEEP</p>
          <Scale label="Sleep Quality (1=terrible, 10=perfect)" val={form.sleep} onChange={set("sleep")}/>
          <Input label="Sleep Window (bedtime – wake time)" value={form.sleepWindow} onChange={set("sleepWindow")} placeholder="e.g. 10:30 PM – 6:00 AM"/>
          <Input label="Estimated Sleep Cycles" value={form.sleepCycles} onChange={set("sleepCycles")} placeholder="e.g. 4–5 cycles (each ~90 min)"/>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:6 }}>Sleep Disruption Notes</label>
            <textarea value={form.sleepDisruption} onChange={e=>set("sleepDisruption")(e.target.value)}
              placeholder="e.g. Woke twice around 2 AM and 4 AM. Gut discomfort. Racing thoughts."
              rows={3}
              style={{ width:"100%", background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"10px 12px", color:B.text, fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit", resize:"vertical" }}/>
          </div>
        </Card>
        <Card style={{ marginBottom:12 }}>
          <p style={{ fontSize:12, fontWeight:700, color:B.gold, margin:"0 0 12px", letterSpacing:0.8 }}>WELLBEING SCALES</p>
          <Scale label="Energy (1=depleted, 10=great)" val={form.energy} onChange={set("energy")}/>
          <Scale label="Hunger (1=fine, 10=starving)" val={form.hunger} onChange={set("hunger")}/>
          <Scale label="Sex Drive (1=low, 10=high)" val={form.sexDrive} onChange={set("sexDrive")}/>
          <Scale label="Brain Fog (1=extreme, 10=none)" val={form.brainFog} onChange={set("brainFog")}/>
          <Scale label="Bloating (1=bad, 10=none)" val={form.bloating} onChange={set("bloating")}/>
        </Card>
        <Card style={{ marginBottom:12, border:`1px solid #ff525244`, background:"#1a0a0a" }}>
          <p style={{ fontSize:12, fontWeight:700, color:"#ff8a80", margin:"0 0 4px", letterSpacing:0.8 }}>STRESS LEVEL</p>
          <p style={{ fontSize:11, color:"#ff525288", margin:"0 0 12px" }}>Rate your average stress this week</p>
          <Scale label="Stress (1=completely calm, 10=maxed out)" val={form.stress} onChange={set("stress")}/>
        </Card>
        <Card style={{ marginBottom:12 }}>
          <p style={{ fontSize:12, fontWeight:700, color:B.gold, margin:"0 0 12px", letterSpacing:0.8 }}>MOOD</p>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:6 }}>Overall Mood This Week</label>
            <select value={form.mood} onChange={e=>set("mood")(e.target.value)}
              style={{ width:"100%", background:B.card, border:`1px solid ${B.border}`, borderRadius:10, padding:"12px 14px", color:form.mood ? B.text : B.muted, fontSize:14, outline:"none", fontFamily:"inherit" }}>
              <option value="">Select…</option>
              <option>Excellent</option><option>Great</option><option>Motivated</option><option>Confident</option>
              <option>Good</option><option>Okay</option><option>Neutral</option>
              <option>Tired</option><option>Stressed</option><option>Anxious</option>
              <option>Frustrated</option><option>Struggling</option><option>Hopeful</option>
            </select>
          </div>
        </Card>
        <Card style={{ marginBottom:12 }}>
          <p style={{ fontSize:12, fontWeight:700, color:B.gold, margin:"0 0 12px", letterSpacing:0.8 }}>DIGESTION</p>
          <Input label="Average Daily Bowel Movements" value={form.bowelCount} onChange={set("bowelCount")} placeholder="e.g. 2"/>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:6 }}>Stool Type</label>
            <select value={form.bowelType} onChange={e=>set("bowelType")(e.target.value)}
              style={{ width:"100%", background:B.card, border:`1px solid ${B.border}`, borderRadius:10, padding:"12px 14px", color:B.text, fontSize:14, outline:"none", fontFamily:"inherit" }}>
              <option value="">Select…</option>
              <option>Well formed</option><option>Loose</option><option>Diarrhea</option><option>Constipated</option><option>Mixed</option>
            </select>
          </div>
        </Card>
        <Card style={{ marginBottom:16 }}>
          <p style={{ fontSize:12, fontWeight:700, color:B.gold, margin:"0 0 12px", letterSpacing:0.8 }}>ADDITIONAL NOTES</p>
          <textarea value={form.notes} onChange={e=>set("notes")(e.target.value)}
            placeholder="Any deviations from the plan, symptoms, concerns, or anything else your coach should know…"
            style={{ width:"100%", background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"10px 12px", color:B.text, fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit", resize:"vertical", minHeight:100 }}/>
        </Card>
        <Btn fullWidth>Submit Check-In</Btn>
      </div>
    </Screen>
  );
};

const HabitTrackerScreen = () => {
  const habits = [
    { id:"supps",   label:"Take supplements",            target:7 },
    { id:"wake",    label:"Wake up at 5 AM",              target:7 },
    { id:"water",   label:"1 Gallon Water Daily",         target:7 },
    { id:"workout", label:"Workout",                      target:5 },
    { id:"shower",  label:"Cold Shower",                  target:5 },
    { id:"lemon",   label:"20oz Lemon Water upon waking", target:7 },
    { id:"sleep",   label:"8 Hour Sleep Window",          target:7 },
    { id:"read",    label:"Read 30 Minutes",              target:5 },
  ];

  const [counts, setCounts] = useState<Record<string,number>>({});
  const set = (id:string, v:number) =>
    setCounts(p => ({ ...p, [id]: Math.min(7, Math.max(0, v)) }));

  const totalPossible = habits.reduce((a,h) => a + h.target, 0);
  const totalDone     = habits.reduce((a,h) => a + (counts[h.id] ?? 0), 0);
  const totalPct      = totalPossible > 0 ? Math.round(totalDone / totalPossible * 100) : 0;

  const scoreColor = (done:number, target:number) => {
    const r = done / target;
    return r >= 0.85 ? B.success : r >= 0.5 ? B.gold : B.muted;
  };

  return (
    <Screen>
      <PageHeader title="Habit Tracker" subtitle="Week of Jul 7 – 13, 2026"/>
      <div style={{ padding:"16px 20px 40px" }}>
        <Card style={{ marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <p style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:0 }}>This Week</p>
            <p style={{ fontSize:11, color:B.muted, margin:0 }}>Goal / Week</p>
          </div>

          {habits.map(h => {
            const count = counts[h.id] ?? 0;
            const col   = scoreColor(count, h.target);
            return (
              <div key={h.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 0", borderTop:`1px solid ${B.border}`, gap:10 }}>
                {/* Label */}
                <span style={{ fontSize:13, color:B.text, flex:1, minWidth:0 }}>{h.label}</span>

                {/* Stepper */}
                <div style={{ display:"flex", alignItems:"center", gap:0, flexShrink:0, background:B.surface, borderRadius:10, overflow:"hidden", border:`1px solid ${B.border}` }}>
                  <button onClick={() => set(h.id, count - 1)}
                    style={{ width:36, height:36, background:"none", border:"none", color:B.muted, fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>−</button>
                  <span style={{ minWidth:28, textAlign:"center", fontSize:15, fontWeight:700, color:col }}>{count}</span>
                  <button onClick={() => set(h.id, count + 1)}
                    style={{ width:36, height:36, background:"none", border:"none", color:B.gold, fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
                </div>

                {/* Target */}
                <span style={{ fontSize:12, color:B.muted, flexShrink:0, width:28, textAlign:"right" }}>/{h.target}</span>
              </div>
            );
          })}
        </Card>

        <div style={{ padding:"12px 14px", background:B.card, border:`1px solid ${B.border}`, borderRadius:10, display:"flex", justifyContent:"space-between" }}>
          <span style={{ fontSize:13, color:B.text }}>Overall Week Score</span>
          <span style={{ fontSize:14, fontWeight:700, color:B.gold }}>{totalPct}%</span>
        </div>
      </div>
    </Screen>
  );
};


const UPDATE_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

const ClientDetailModal = ({ client, onClose, onNavigate, onSaved, onFlagUnreviewed }: any) => {
  const modalDeadline = useDeadline(client?.email);
  const isMobile = useIsMobile();
  const [historyView, setHistoryView] = useState<"timeline"|"charts">("timeline");
  const [localHistory, setLocalHistory] = useState<any[]>(client?.checkinHistory || []);
  const [editingIdx,   setEditingIdx]   = useState<number|null>(null);
  const [draftNote,    setDraftNote]    = useState('');
  const [draftLoom,    setDraftLoom]    = useState('');
  const [updateDay,    setUpdateDay]    = useState<string>('');
  const [savingDay,    setSavingDay]    = useState(false);
  const [dayError,     setDayError]     = useState(false);
  const [startError,   setStartError]   = useState(false);
  const [startDate,    setStartDate]    = useState<string>('');
  const [savingStart,  setSavingStart]  = useState(false);
  useEffect(() => {
    if (!client?.uuid) return;
    sbGet('user_profiles', `id=eq.${client.uuid}&select=update_day,start_date`)
      .then((rows: any[]) => {
        if (Array.isArray(rows) && rows.length > 0 && rows[0].start_date) setStartDate(rows[0].start_date);
        if (Array.isArray(rows) && rows.length > 0 && rows[0].update_day) {
          setUpdateDay(rows[0].update_day);
        } else {
          // Fallback: localStorage bridge works before SQL/RLS is configured
          const cached = localStorage.getItem(`eden_update_day_${client.uuid}`);
          if (cached) setUpdateDay(cached);
        }
      });
  }, [client?.uuid]);

  if (!client) return null;

  const history: any[] = localHistory;
  const lastCompleted = history.length > 0 ? history[0].date : client.lastCheckin;

  // Oldest→newest for charts (left = past, right = present)
  const chartData = [...history].reverse().map((e:any) => ({
    date: e.date.replace(" 2026",""),
    weight:    parseFloat(e.weight),
    compliance:e.compliance,
    energy:    e.energy,
    sleep:     e.sleep,
    bloating:  e.bloating,
    brainFog:  e.brainFog,
    sexDrive:  e.sexDrive,
    hunger:    e.hunger,
    stress:    e.stress,
    steps:     parseInt(String(e.steps).replace(/,/g,"")),
    heartRate: parseInt(e.heartRate),
    hrv:       parseInt(e.hrv),
    temp:      parseFloat(e.temp),
  }));

  const scoreColor = (val: number, invert = false) => {
    const v = invert ? 11 - val : val;
    if (v >= 8) return "#4caf50";
    if (v >= 5) return B.gold;
    return "#ff5252";
  };

  const ScoreChip = ({ label, val, invert = false }: { label:string; val:number; invert?:boolean }) => (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", minWidth:44 }}>
      <div style={{
        width:32, height:32, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
        background:`${scoreColor(val, invert)}22`, border:`1.5px solid ${scoreColor(val, invert)}`,
        fontSize:13, fontWeight:800, color:scoreColor(val, invert)
      }}>{val}</div>
      <div style={{ fontSize:8, color:B.muted, marginTop:3, textTransform:"uppercase", letterSpacing:.6, textAlign:"center" }}>{label}</div>
    </div>
  );

  // Shared chart theme
  const CT = {
    grid:    "#2a2a2a",
    tick:    "#666",
    tooltip: { contentStyle:{ background:"#1a1a1a", border:"1px solid #333", borderRadius:8, fontSize:11 }, labelStyle:{ color:"#fff", fontWeight:700 }, itemStyle:{ color:"#ccc" } },
  };
  const ChartPanel = ({ title, children }: { title:string; children:React.ReactNode }) => (
    <div style={{ marginBottom:20 }}>
      <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 8px" }}>{title}</p>
      <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:12, padding:"12px 4px 8px 0" }}>
        {children}
      </div>
    </div>
  );

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:B.surface, borderTop:`2px solid ${B.gold}`, borderRadius:"18px 18px 0 0", width:"100%", maxWidth:600, maxHeight:"92vh", display:"flex", flexDirection:"column" }}>
        {/* Handle */}
        <div style={{ display:"flex", justifyContent:"center", padding:"10px 0 0" }}>
          <div style={{ width:40, height:4, borderRadius:2, background:B.border }}/>
        </div>
        {/* Header */}
        <div style={{ padding:"14px 20px 12px", borderBottom:`1px solid ${B.border}`, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <p style={{ fontSize:18, fontWeight:800, color:B.text, margin:"0 0 4px" }}><LN>{client.name}</LN></p>
            <p style={{ fontSize:11, color:B.muted, margin:0 }}><LN>{client.email}</LN> · <LN>{client.phone}</LN></p>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <Badge color={client.alert ? B.gold : B.success}>{client.status}</Badge>
            <button onClick={onClose} style={{ background:"none", border:"none", color:B.muted, fontSize:22, cursor:"pointer", padding:0, lineHeight:1 }}>×</button>
          </div>
        </div>
        {/* Action buttons — pinned below header, no scroll needed */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, padding:"10px 16px", borderBottom:`1px solid ${B.border}`, flexShrink:0 }}>
          {[
            { label:"📋 Diet Plan",    color:B.gold,    bg:`${B.gold}22`,    border:`1px solid ${B.gold}44`,    tab:"diet" },
            { label:"💬 Message",      color:"#4FD89A", bg:"#4FD89A22",      border:"1px solid #4FD89A44",      tab:"msgs" },
            { label:"🧪 Labs",         color:"#D4A8F0", bg:"#D4A8F022",      border:"1px solid #D4A8F044",      tab:"labs" },
            { label:"📊 Check-In",     color:"#6FB8E8", bg:"#6FB8E822",      border:"1px solid #6FB8E844",      tab:"checkin" },
            { label:"💊 Supplements",  color:"#f0a060", bg:"#f0a06022",      border:"1px solid #f0a06044",      tab:"supplements" },
            { label:"💪 Workout",      color:"#f06060", bg:"#f0606022",      border:"1px solid #f0606044",      tab:"workout" },
            { label:"⌚ Wearables",    color:"#88ddaa", bg:"#88ddaa22",      border:"1px solid #88ddaa44",      tab:"wearables" },
          ].map(({label,color,bg,border,tab})=>(
            <button key={label}
              onClick={()=>{ onClose(); onNavigate?.(tab, { email:client.email, name:client.name, role:'client' }) }}
              style={{ background:bg, border, borderRadius:10, padding:"10px 8px", color, fontWeight:700, fontSize:11, cursor:"pointer" }}>
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>

          {/* Re-flag as unreviewed — for when the coach can't finish the review now */}
          {onFlagUnreviewed && client.lastCheckinId && (
            <div style={{ marginBottom:14 }}>
              {client.needsReview ? (
                <div style={{ background:`${B.gold}15`, border:`1px solid ${B.gold}55`, borderRadius:10, padding:"9px 12px",
                  fontSize:11, fontWeight:700, color:B.gold, textAlign:"center" }}>
                  🔖 Flagged — this client will show the NEW CHECK-IN badge again
                </div>
              ) : (
                <button onClick={async ()=>{ await onFlagUnreviewed(); }}
                  style={{ width:"100%", background:"none", border:`1px dashed ${B.gold}66`, borderRadius:10, padding:"9px 12px",
                    color:B.gold, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                  🔖 Not done reviewing? Flag as NEW again so you don't forget
                </button>
              )}
            </div>
          )}

          {/* Quick stats — 2×2 */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
            {[
              { label:"Current Weight", val:client.currentWeight, hi:false },
              { label:"Target Weight",  val:client.targetWeight,  hi:false },
              { label:"Last Check-In",  val:lastCompleted,        hi:false },
              { label:"Next Check-In",  val:client.nextCheckin,   hi:client.nextCheckin==="Overdue" },
            ].map(({label,val,hi})=>(
              <div key={label} style={{ background:B.card, border:`1px solid ${hi ? B.gold+"66" : B.border}`, borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
                <p style={{ fontSize:13, fontWeight:700, color: hi ? "#ff9800" : B.gold, margin:"0 0 3px" }}>{val}</p>
                <p style={{ fontSize:9, color:B.muted, margin:0 }}>{label}</p>
              </div>
            ))}
          </div>

          {/* ── Update Day Assignment ── */}
          <div style={{ background:B.card, border:`1px solid ${updateDay ? B.gold+"55" : B.border}`, borderRadius:12, padding:"14px 16px", marginBottom:16 }}>
            <p style={{ fontSize:9, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 10px" }}>📅 Update Day</p>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <select
                value={updateDay}
                onChange={async e => {
                  const day = e.target.value;
                  setUpdateDay(day);
                  if (!client.uuid) return;
                  // Write to localStorage immediately — client reads this as fallback
                  // until Supabase user_profiles + permissive RLS are live
                  if (day) localStorage.setItem(`eden_update_day_${client.uuid}`, day);
                  else localStorage.removeItem(`eden_update_day_${client.uuid}`);
                  setSavingDay(true); setDayError(false);
                  const ok = await sbPatch('user_profiles', `id=eq.${client.uuid}`, { update_day: day });
                  setSavingDay(false);
                  if (!ok) { setDayError(true); return; }
                  onSaved?.(client.uuid, { checkInDay: day });
                }}
                style={{ flex:1, background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"9px 12px",
                  color: updateDay ? B.gold : B.muted, fontSize:13, outline:"none", cursor:"pointer" }}>
                <option value="">— Not assigned yet —</option>
                {UPDATE_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {savingDay
                ? <span style={{ fontSize:11, color:B.muted, whiteSpace:"nowrap" }}>Saving…</span>
                : dayError
                  ? <span style={{ fontSize:11, color:B.danger, fontWeight:700, whiteSpace:"nowrap" }}>⚠ Not saved</span>
                  : updateDay
                    ? <span style={{ fontSize:11, color:B.gold, fontWeight:700, whiteSpace:"nowrap" }}>✓ Saved</span>
                    : null}
            </div>
            {dayError && (
              <p style={{ fontSize:11, color:B.danger, margin:"8px 0 0", lineHeight:1.5 }}>
                Couldn't save the update day — try again. If it keeps failing, contact the admin.
              </p>
            )}
            {updateDay && (
              <p style={{ fontSize:11, color:B.muted, margin:"8px 0 0", lineHeight:1.5 }}>
                Client sees <strong style={{ color:B.text }}>every {updateDay}</strong> as their weekly deadline (before {modalDeadline.text}).
              </p>
            )}
            {!client.uuid && (
              <p style={{ fontSize:10, color:B.muted, margin:"6px 0 0", fontStyle:"italic" }}>
                Add a uuid to this client's roster entry to enable saving.
              </p>
            )}
          </div>

          {/* ── Contract Start Date ── */}
          <div style={{ background:B.card, border:`1px solid ${startDate ? B.gold+"55" : B.border}`, borderRadius:12, padding:"14px 16px", marginBottom:16 }}>
            <p style={{ fontSize:9, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 10px" }}>🗓️ Contract Start Date</p>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <input type="date" value={startDate}
                onChange={async e => {
                  const val = e.target.value;
                  setStartDate(val);
                  if (!client.uuid) return;
                  setSavingStart(true); setStartError(false);
                  const ok = await sbPatch('user_profiles', `id=eq.${client.uuid}`, { start_date: val || null });
                  setSavingStart(false);
                  if (!ok) { setStartError(true); return; }
                  onSaved?.(client.uuid, { startDate: val || null });
                }}
                style={{ flex:1, background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"9px 12px",
                  color: startDate ? B.gold : B.muted, fontSize:13, outline:"none", colorScheme:"dark" }}/>
              {savingStart
                ? <span style={{ fontSize:11, color:B.muted, whiteSpace:"nowrap" }}>Saving…</span>
                : startError
                  ? <span style={{ fontSize:11, color:B.danger, fontWeight:700, whiteSpace:"nowrap" }}>⚠ Not saved</span>
                  : startDate
                    ? <span style={{ fontSize:11, color:B.gold, fontWeight:700, whiteSpace:"nowrap" }}>✓ Saved</span>
                    : null}
            </div>
            {startError && (
              <p style={{ fontSize:11, color:B.danger, margin:"8px 0 0", lineHeight:1.5 }}>
                Couldn't save the start date — try again. If it keeps failing, contact the admin.
              </p>
            )}
            <p style={{ fontSize:11, color:B.muted, margin:"8px 0 0", lineHeight:1.5 }}>
              {startDate && new Date(`${startDate}T00:00:00`) > new Date()
                ? <>Client won't be counted late on updates until <strong style={{ color:B.text }}>{new Date(`${startDate}T00:00:00`).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</strong>.</>
                : "Set a future date for clients whose contract hasn't started yet — they won't be counted late until then."}
            </p>
          </div>

          {/* Profile */}
          <Card style={{ marginBottom:12 }}>
            <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 10px" }}>Profile</p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {[
                ["Height", client.height], ["Age", client.age+" yrs"],
                ["Gender", client.gender], ["Client Since", client.startDate],
              ].map(([l,v])=>(
                <div key={l}>
                  <p style={{ fontSize:9, color:B.muted, margin:"0 0 2px", textTransform:"uppercase", letterSpacing:.8 }}>{l}</p>
                  <p style={{ fontSize:13, color:B.text, fontWeight:600, margin:0 }}>{v}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Protocol & Goal */}
          <Card style={{ marginBottom:12 }}>
            <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 10px" }}>Protocol & Goal</p>
            <p style={{ fontSize:12, color:B.gold, fontWeight:600, margin:"0 0 6px" }}>{client.protocol}</p>
            <p style={{ fontSize:12, color:B.text, margin:"0 0 10px" }}>{client.goal}</p>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {client.tags.map((t:string)=>(
                <span key={t} style={{ fontSize:10, fontWeight:700, color:B.gold, background:`${B.gold}18`, border:`1px solid ${B.gold}33`, borderRadius:6, padding:"3px 8px" }}>{t}</span>
              ))}
            </div>
          </Card>

          {/* Coach notes */}
          <Card style={{ marginBottom:12, borderLeft:`3px solid ${B.gold}` }}>
            <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 8px" }}>Coach Notes</p>
            <p style={{ fontSize:12, color:B.text, margin:0, lineHeight:1.7 }}>{client.notes}</p>
          </Card>

          {/* Pending alerts */}
          {(client.alert || client.pendingLabs) && (
            <Card style={{ marginBottom:12, background:`${B.gold}0d`, border:`1px solid ${B.gold}44` }}>
              <p style={{ fontSize:10, fontWeight:700, color:B.gold, letterSpacing:1, textTransform:"uppercase", margin:"0 0 8px" }}>⚠ Pending Actions</p>
              {client.status.toLowerCase().includes("pending") && (
                <p style={{ fontSize:12, color:B.text, margin:"0 0 4px" }}>• Check-in response overdue</p>
              )}
              {client.pendingLabs && (
                <p style={{ fontSize:12, color:B.text, margin:0 }}>• Lab results pending review</p>
              )}
            </Card>
          )}

          {/* ── Check-In History ── */}
          {history.length > 0 && (
            <Card style={{ marginBottom:12, padding:0, overflow:"hidden" }}>
              {/* Section header */}
              <div style={{ padding:"12px 16px 10px", borderBottom:`1px solid ${B.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                {/* Toggle */}
                <div style={{ display:"flex", gap:0 }}>
                  {(["timeline","charts"] as const).map(v=>(
                    <button key={v} onClick={()=>setHistoryView(v)}
                      style={{ padding:"4px 14px", fontSize:11, fontWeight:700, cursor:"pointer", border:"none", borderRadius:6,
                        background: historyView===v ? B.gold : "transparent",
                        color: historyView===v ? "#000" : B.muted,
                        textTransform:"capitalize" }}>
                      {v==="timeline" ? "⏱ Timeline" : "📈 Charts"}
                    </button>
                  ))}
                </div>
                <span style={{ fontSize:10, color:B.muted }}>{history.length} entries</span>
              </div>

              {/* ── TIMELINE VIEW ── */}
              {historyView === "timeline" && history.map((entry:any, idx:number) => {
                const compColor = entry.compliance >= 90 ? "#4caf50" : entry.compliance >= 75 ? B.gold : "#ff5252";
                const borderAccent = entry.compliance >= 90 ? "#4caf50" : entry.compliance >= 75 ? B.gold : "#ff5252";
                return (
                  <div key={idx} style={{ borderBottom: idx < history.length-1 ? `1px solid ${B.border}` : "none",
                    padding:"16px", borderLeft:`3px solid ${borderAccent}44`, marginLeft:2 }}>

                    {/* Header row */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                      <div>
                        <p style={{ fontSize:14, fontWeight:800, color:B.text, margin:"0 0 2px" }}>
                          {entry.date}
                          {entry.time && <span style={{ fontSize:11, fontWeight:500, color:B.muted, marginLeft:8 }}>· {entry.time}</span>}
                        </p>
                        <p style={{ fontSize:12, color:B.muted, margin:0 }}>{entry.weight} lbs</p>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <span style={{ fontSize:11, fontWeight:700, color:compColor, background:`${compColor}18`,
                          border:`1px solid ${compColor}44`, borderRadius:6, padding:"2px 8px" }}>
                          {entry.compliance}% compliant
                        </span>
                      </div>
                    </div>
                    {/* Mood badge */}
                    {entry.mood && (
                      <div style={{ marginBottom:10 }}>
                        <span style={{ fontSize:11, fontWeight:600, color:B.gold, background:`${B.gold}18`,
                          border:`1px solid ${B.gold}33`, borderRadius:20, padding:"3px 10px" }}>
                          😊 {entry.mood}
                        </span>
                      </div>
                    )}

                    {/* Vitals strip — row 1: Temp / BP / Steps / HR / HRV */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:5, marginBottom:5 }}>
                      {[
                        ["Temp",    entry.temp+"°F"],
                        ["BP",      entry.bloodPressure || "—"],
                        ["Steps",   entry.steps],
                        ["HR",      entry.heartRate+" bpm"],
                        ["HRV",     entry.hrv],
                      ].map(([l,v])=>(
                        <div key={l} style={{ background:B.bg, borderRadius:7, padding:"6px 8px", textAlign:"center" }}>
                          <p style={{ fontSize:8, color:B.muted, margin:"0 0 2px", textTransform:"uppercase", letterSpacing:.5 }}>{l}</p>
                          <p style={{ fontSize:10, fontWeight:700, color:B.text, margin:0 }}>{v}</p>
                        </div>
                      ))}
                    </div>
                    {/* Vitals strip — row 2: BMs */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:5, marginBottom:10 }}>
                      <div style={{ background:B.bg, borderRadius:7, padding:"6px 10px", display:"flex", alignItems:"center", gap:10 }}>
                        <p style={{ fontSize:8, color:B.muted, margin:0, textTransform:"uppercase", letterSpacing:.5, minWidth:24 }}>BMs</p>
                        <p style={{ fontSize:10, fontWeight:700, color:B.text, margin:0 }}>{entry.bowelCount} · {entry.bowelType}</p>
                      </div>
                    </div>

                    {/* Sleep details block */}
                    {(entry.sleepWindow || entry.sleepDisruption || entry.sleepCycles) && (
                      <div style={{ background:"#1a1a2e", border:"1px solid #2a2a4a", borderRadius:9, padding:"9px 11px", marginBottom:10 }}>
                        <p style={{ fontSize:9, color:"#7b8cde", textTransform:"uppercase", letterSpacing:.8, margin:"0 0 7px", fontWeight:700 }}>🌙 Sleep</p>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom: entry.sleepDisruption ? 7 : 0 }}>
                          {entry.sleepWindow && (
                            <div>
                              <p style={{ fontSize:8, color:B.muted, margin:"0 0 2px", textTransform:"uppercase", letterSpacing:.5 }}>Window</p>
                              <p style={{ fontSize:11, fontWeight:600, color:B.text, margin:0 }}>{entry.sleepWindow}</p>
                            </div>
                          )}
                          {entry.sleepCycles && (
                            <div>
                              <p style={{ fontSize:8, color:B.muted, margin:"0 0 2px", textTransform:"uppercase", letterSpacing:.5 }}>Cycles</p>
                              <p style={{ fontSize:11, fontWeight:600, color:B.text, margin:0 }}>{entry.sleepCycles}</p>
                            </div>
                          )}
                        </div>
                        {entry.sleepDisruption && (
                          <div>
                            <p style={{ fontSize:8, color:B.muted, margin:"0 0 2px", textTransform:"uppercase", letterSpacing:.5 }}>Disruptions</p>
                            <p style={{ fontSize:11, color:"#ccc", margin:0, lineHeight:1.55, fontStyle:"italic" }}>{entry.sleepDisruption}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* All 7 score chips */}
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
                      <ScoreChip label="Energy"    val={entry.energy} />
                      <ScoreChip label="Sleep"     val={entry.sleep} />
                      <ScoreChip label="Bloating"  val={entry.bloating} />
                      <ScoreChip label="Brain Fog" val={entry.brainFog} />
                      <ScoreChip label="Sex Drive" val={entry.sexDrive} />
                      <ScoreChip label="Hunger"    val={entry.hunger} invert />
                      <ScoreChip label="Stress"    val={entry.stress} invert />
                    </div>

                    {/* Client notes */}
                    <div style={{ background:B.bg, borderRadius:8, padding:"9px 11px", marginBottom:7 }}>
                      <p style={{ fontSize:9, color:B.muted, textTransform:"uppercase", letterSpacing:.8, margin:"0 0 4px", fontWeight:700 }}>Client</p>
                      <p style={{ fontSize:12, color:B.text, margin:0, lineHeight:1.6, fontStyle:"italic" }}>"{entry.clientNotes}"</p>
                    </div>

                    {/* Coach notes — inline editable */}
                    <div style={{ background:`${B.gold}0d`, border:`1px solid ${B.gold}33`, borderRadius:8, padding:"9px 11px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                        <p style={{ fontSize:9, color:B.gold, textTransform:"uppercase", letterSpacing:.8, margin:0, fontWeight:700 }}>💬 Coach</p>
                        {editingIdx !== idx && (
                          <button onClick={()=>{ setEditingIdx(idx); setDraftNote(entry.coachNotes||''); setDraftLoom(entry.loomUrl||''); }}
                            style={{ background:"none", border:`1px solid ${B.gold}44`, borderRadius:6, padding:"2px 8px",
                              color:B.gold, fontSize:10, cursor:"pointer", fontWeight:600 }}>
                            ✏ {entry.coachNotes ? 'Edit' : 'Add feedback'}
                          </button>
                        )}
                      </div>

                      {editingIdx === idx ? (
                        <>
                          <textarea value={draftNote} onChange={e=>setDraftNote(e.target.value)}
                            placeholder="Add your feedback for this check-in week…"
                            rows={3}
                            style={{ width:"100%", background:B.bg, border:`1px solid ${B.gold}44`, borderRadius:7,
                              padding:"8px 10px", color:B.text, fontSize:12, resize:"vertical", outline:"none",
                              boxSizing:"border-box", fontFamily:"inherit", marginBottom:8 }}/>
                          <input value={draftLoom} onChange={e=>setDraftLoom(e.target.value)}
                            placeholder="https://loom.com/share/… (optional Loom for this week)"
                            style={{ width:"100%", background:B.bg, border:`1px solid ${B.border}`, borderRadius:7,
                              padding:"7px 10px", color:B.text, fontSize:11, outline:"none",
                              boxSizing:"border-box", marginBottom:8 }}/>
                          <div style={{ display:"flex", gap:8 }}>
                            <button onClick={()=>{
                                setLocalHistory(prev => prev.map((e:any,i:number) =>
                                  i===idx ? {...e, coachNotes:draftNote, loomUrl:draftLoom} : e));
                                setEditingIdx(null);
                              }}
                              style={{ flex:1, background:B.gold, border:"none", borderRadius:7, padding:"7px",
                                color:"#000", fontWeight:700, fontSize:12, cursor:"pointer" }}>
                              Save
                            </button>
                            <button onClick={()=>setEditingIdx(null)}
                              style={{ background:"none", border:`1px solid ${B.border}`, borderRadius:7,
                                padding:"7px 14px", color:B.muted, fontSize:12, cursor:"pointer" }}>
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p style={{ fontSize:12, color: entry.coachNotes ? B.text : B.muted,
                            fontStyle: entry.coachNotes ? "normal" : "italic", margin:0, lineHeight:1.6 }}>
                            {entry.coachNotes || "No coach notes yet — click Add feedback to respond."}
                          </p>
                          {entry.loomUrl && (
                            <a href={entry.loomUrl} target="_blank" rel="noreferrer"
                              style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, background:B.bg,
                                borderRadius:7, padding:"7px 10px", textDecoration:"none", border:`1px solid ${B.border}` }}>
                              <span style={{ fontSize:18 }}>▶️</span>
                              <div>
                                <div style={{ fontSize:11, color:B.gold, fontWeight:600 }}>Watch Video Review</div>
                                <div style={{ fontSize:9, color:B.muted, marginTop:1, overflow:"hidden",
                                  textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:200 }}>{entry.loomUrl}</div>
                              </div>
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* ── CHARTS VIEW ── */}
              {historyView === "charts" && (
                <div style={{ padding:"16px" }}>

                  {/* Weight */}
                  <ChartPanel title="Weight (lbs)">
                    <ResponsiveContainer width="100%" height={140}>
                      <AreaChart data={chartData} margin={{ top:4, right:16, left:-20, bottom:0 }}>
                        <defs>
                          <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={B.gold} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={B.gold} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
                        <XAxis dataKey="date" tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false}/>
                        <YAxis tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false} domain={["auto","auto"]}/>
                        <Tooltip {...CT.tooltip}/>
                        <Area type="monotone" dataKey="weight" stroke={B.gold} strokeWidth={2} fill="url(#wGrad)" dot={{ fill:B.gold, r:3 }} activeDot={{ r:5 }}/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartPanel>

                  {/* Compliance */}
                  <ChartPanel title="Weekly Compliance (%)">
                    <ResponsiveContainer width="100%" height={130}>
                      <BarChart data={chartData} margin={{ top:4, right:16, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CT.grid} vertical={false}/>
                        <XAxis dataKey="date" tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false}/>
                        <YAxis tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false} domain={[60,100]}/>
                        <Tooltip {...CT.tooltip} formatter={(v:any)=>[v+"%","Compliance"]}/>
                        <Bar dataKey="compliance" fill={B.gold} radius={[4,4,0,0]}
                          label={{ position:"top", fontSize:9, fill:B.gold, formatter:(v:any)=>v+"%"}}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartPanel>

                  {/* Wellbeing — Energy / Sleep / Sex Drive */}
                  <ChartPanel title="Energy · Sleep · Sex Drive (1–10, higher = better)">
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={chartData} margin={{ top:4, right:16, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
                        <XAxis dataKey="date" tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false}/>
                        <YAxis tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false} domain={[1,10]}/>
                        <Tooltip {...CT.tooltip}/>
                        <Legend wrapperStyle={{ fontSize:10, color:B.muted, paddingTop:4 }}/>
                        <Line type="monotone" dataKey="energy"   stroke={B.gold}   strokeWidth={2} dot={{ r:3 }} activeDot={{ r:5 }} name="Energy"/>
                        <Line type="monotone" dataKey="sleep"    stroke="#6FB8E8"  strokeWidth={2} dot={{ r:3 }} activeDot={{ r:5 }} name="Sleep"/>
                        <Line type="monotone" dataKey="sexDrive" stroke="#FF7EB3"  strokeWidth={2} dot={{ r:3 }} activeDot={{ r:5 }} name="Sex Drive"/>
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartPanel>

                  {/* Wellbeing — Brain Fog / Bloating */}
                  <ChartPanel title="Brain Fog · Bloating (1–10, higher = better)">
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={chartData} margin={{ top:4, right:16, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
                        <XAxis dataKey="date" tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false}/>
                        <YAxis tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false} domain={[1,10]}/>
                        <Tooltip {...CT.tooltip}/>
                        <Legend wrapperStyle={{ fontSize:10, color:B.muted, paddingTop:4 }}/>
                        <Line type="monotone" dataKey="brainFog" stroke="#D4A8F0"  strokeWidth={2} dot={{ r:3 }} activeDot={{ r:5 }} name="Brain Fog"/>
                        <Line type="monotone" dataKey="bloating" stroke="#4FD89A"  strokeWidth={2} dot={{ r:3 }} activeDot={{ r:5 }} name="Bloating"/>
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartPanel>

                  {/* Stress & Hunger (lower = better) */}
                  <ChartPanel title="Stress & Hunger (1–10, lower = better)">
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={chartData} margin={{ top:4, right:16, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
                        <XAxis dataKey="date" tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false}/>
                        <YAxis tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false} domain={[1,10]}/>
                        <Tooltip {...CT.tooltip}/>
                        <Legend wrapperStyle={{ fontSize:10, color:B.muted, paddingTop:4 }}/>
                        <Line type="monotone" dataKey="stress"  stroke="#ff5252" strokeWidth={2} dot={{ r:3 }} activeDot={{ r:5 }} name="Stress"/>
                        <Line type="monotone" dataKey="hunger"  stroke="#FF9E6C" strokeWidth={2} dot={{ r:3 }} activeDot={{ r:5 }} name="Hunger"/>
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartPanel>

                  {/* Steps */}
                  <ChartPanel title="Daily Steps">
                    <ResponsiveContainer width="100%" height={130}>
                      <AreaChart data={chartData} margin={{ top:4, right:16, left:-8, bottom:0 }}>
                        <defs>
                          <linearGradient id="stepsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#6FB8E8" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#6FB8E8" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
                        <XAxis dataKey="date" tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false}/>
                        <YAxis tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false}
                          tickFormatter={(v:number)=>v>=1000?Math.round(v/1000)+"k":String(v)} domain={["auto","auto"]}/>
                        <Tooltip {...CT.tooltip} formatter={(v:any)=>[Number(v).toLocaleString()+" steps","Steps"]}/>
                        <Area type="monotone" dataKey="steps" stroke="#6FB8E8" strokeWidth={2} fill="url(#stepsGrad)" dot={{ fill:"#6FB8E8", r:3 }} activeDot={{ r:5 }}/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartPanel>

                  {/* Heart Rate */}
                  <ChartPanel title="Resting Heart Rate (bpm) — lower trend = better">
                    <ResponsiveContainer width="100%" height={130}>
                      <LineChart data={chartData} margin={{ top:4, right:16, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
                        <XAxis dataKey="date" tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false}/>
                        <YAxis tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false} domain={["auto","auto"]}/>
                        <Tooltip {...CT.tooltip} formatter={(v:any)=>[v+" bpm","Heart Rate"]}/>
                        <Line type="monotone" dataKey="heartRate" stroke="#ff5252" strokeWidth={2} dot={{ fill:"#ff5252", r:3 }} activeDot={{ r:5 }} name="HR (bpm)"/>
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartPanel>

                  {/* HRV */}
                  <ChartPanel title="HRV — higher trend = better recovery">
                    <ResponsiveContainer width="100%" height={130}>
                      <LineChart data={chartData} margin={{ top:4, right:16, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
                        <XAxis dataKey="date" tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false}/>
                        <YAxis tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false} domain={["auto","auto"]}/>
                        <Tooltip {...CT.tooltip} formatter={(v:any)=>[v,"HRV"]}/>
                        <Line type="monotone" dataKey="hrv" stroke="#4FD89A" strokeWidth={2} dot={{ fill:"#4FD89A", r:3 }} activeDot={{ r:5 }} name="HRV"/>
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartPanel>

                  {/* Body Temp */}
                  <ChartPanel title="Body Temperature (°F)">
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={chartData} margin={{ top:4, right:16, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CT.grid}/>
                        <XAxis dataKey="date" tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false}/>
                        <YAxis tick={{ fill:CT.tick, fontSize:9 }} tickLine={false} axisLine={false} domain={["auto","auto"]}/>
                        <Tooltip {...CT.tooltip} formatter={(v:any)=>[v+"°F","Temp"]}/>
                        <Line type="monotone" dataKey="temp" stroke="#D4A8F0" strokeWidth={2} dot={{ fill:"#D4A8F0", r:3 }} activeDot={{ r:5 }}/>
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartPanel>

                </div>
              )}
            </Card>
          )}

        </div>
      </div>
    </div>
  );
};

// ── Alert Detail Modal ────────────────────────────────────────────────────────
const AlertDetailModal = ({ client, resolved, onResolve, onClose }: {
  client: any; resolved: Set<string>; onResolve: (r: string) => void; onClose: () => void;
}) => {
  const reasons: string[] = client.alertReasons || [];
  const allResolved = reasons.every(r => resolved.has(r));
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", zIndex:200,
      display:"flex", alignItems:"flex-end", justifyContent:"center" }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:B.surface, borderTop:`2px solid ${B.gold}`, borderRadius:"18px 18px 0 0",
        width:"100%", maxWidth:560, maxHeight:"80vh", display:"flex", flexDirection:"column" }}>
        {/* Handle */}
        <div style={{ display:"flex", justifyContent:"center", padding:"10px 0 0" }}>
          <div style={{ width:40, height:4, borderRadius:2, background:B.border }}/>
        </div>
        {/* Header */}
        <div style={{ padding:"14px 20px 12px", borderBottom:`1px solid ${B.border}`,
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <p style={{ fontSize:16, fontWeight:800, color:B.text, margin:"0 0 2px" }}>⚠️ <LN>{client.name}</LN> — Alerts</p>
            <p style={{ fontSize:11, color:B.muted, margin:0 }}>{reasons.length} issue{reasons.length!==1?"s":""} flagged</p>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:B.muted,
            fontSize:22, cursor:"pointer", padding:0, lineHeight:1 }}>×</button>
        </div>
        {/* Reasons list */}
        <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
          {reasons.length === 0 ? (
            <p style={{ color:B.muted, fontSize:13 }}>No specific alerts recorded.</p>
          ) : reasons.map((r,i) => {
            const done = resolved.has(r);
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px",
                background: done ? "#0d1a0d" : B.card,
                border:`1px solid ${done ? B.success+"44" : B.border}`,
                borderRadius:10, marginBottom:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13, color: done ? B.muted : B.text, margin:0,
                    textDecoration: done ? "line-through" : "none", lineHeight:1.4 }}>{r}</p>
                  {done && <p style={{ fontSize:10, color:B.success, margin:"4px 0 0", fontWeight:600 }}>✓ Resolved</p>}
                </div>
                {!done && (
                  <button onClick={()=>onResolve(r)}
                    style={{ background:`${B.success}22`, border:`1px solid ${B.success}55`,
                      borderRadius:8, padding:"6px 12px", color:B.success, fontSize:11,
                      fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
                    Mark Resolved
                  </button>
                )}
              </div>
            );
          })}
          {allResolved && reasons.length > 0 && (
            <div style={{ textAlign:"center", padding:"16px 0" }}>
              <p style={{ fontSize:28, margin:"0 0 8px" }}>✅</p>
              <p style={{ fontSize:14, fontWeight:700, color:B.success, margin:"0 0 4px" }}>All alerts resolved!</p>
              <p style={{ fontSize:12, color:B.muted, margin:0 }}>This client's badge will show green.</p>
            </div>
          )}
        </div>
        {/* Footer */}
        {!allResolved && reasons.length > 0 && (
          <div style={{ padding:"12px 20px", borderTop:`1px solid ${B.border}` }}>
            <button onClick={()=>reasons.forEach(r=>onResolve(r))}
              style={{ width:"100%", background:`${B.success}22`, border:`1px solid ${B.success}55`,
                borderRadius:10, padding:"12px", color:B.success, fontSize:13, fontWeight:700, cursor:"pointer" }}>
              ✅ Mark All Resolved
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Missing Check-In helpers ──────────────────────────────────────────────────
function parseLastCheckin(str: string): Date | null {
  if (!str || str === 'Overdue' || str === '—') return null;
  const d = new Date(`${str} 2026`);
  return isNaN(d.getTime()) ? null : d;
}
function hasNotStarted(c: any): boolean {
  // Client whose contract start date is in the future — never counted late
  if (!c?.startDate) return false;
  const start = new Date(`${c.startDate}T00:00:00`);
  if (isNaN(start.getTime())) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  return start.getTime() > today.getTime();
}
function daysUntilStart(c: any): number {
  const start = new Date(`${c.startDate}T00:00:00`);
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((start.getTime() - today.getTime()) / 86400000);
}
// Most recent instant the deadline occurred: the latest <checkInDay> at <time> in <tz>
// that is already in the past. Returns null if the day name is unknown.
function lastDeadlineInstant(checkInDay: string, time: string, tz: string): Date | null {
  if (!checkInDay) return null;
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit', weekday:'long' });
  for (let back = 0; back < 9; back++) {
    const parts = fmt.formatToParts(new Date(Date.now() - back * 86400000));
    const p: any = Object.fromEntries(parts.map(x => [x.type, x.value]));
    if (p.weekday === checkInDay) {
      const inst = new Date(zonedTimeToIso(`${p.year}-${p.month}-${p.day}`, time, tz));
      if (inst.getTime() <= Date.now()) return inst;
      // deadline for today hasn't hit yet — keep walking back to last week's occurrence
    }
  }
  return null;
}
function isMissingCheckin(c: any, dl?: { time: string; tz: string }): boolean {
  if (hasNotStarted(c)) return false;
  if (c.nextCheckin === 'Overdue') return true;
  const last = c.lastCheckinAt ? new Date(c.lastCheckinAt) : parseLastCheckin(c.lastCheckin);
  // Deadline-aware rule: missing if no submission since the last time
  // their update day + deadline time (in the coach's timezone) passed.
  if (dl && c.checkInDay) {
    const inst = lastDeadlineInstant(c.checkInDay, dl.time, dl.tz);
    if (inst) {
      // Contract started after that deadline passed → not counted yet
      if (c.startDate && new Date(`${c.startDate}T00:00:00`).getTime() > inst.getTime()) return false;
      return !last || isNaN(last.getTime()) || last.getTime() < inst.getTime();
    }
  }
  // Fallback (no update day assigned): more than 7 days since last check-in
  if (!last || isNaN(last.getTime())) return true;
  return (Date.now() - last.getTime()) / 86400000 > 7;
}

// ── Upcoming contract starts (shared by coach + admin views) ────────────────
const UpcomingStartsSection = ({ clients, loomMode = false }: { clients: any[]; loomMode?: boolean }) => {
  const upcoming = (clients || []).filter(hasNotStarted)
    .sort((a,b) => String(a.startDate).localeCompare(String(b.startDate)));
  if (upcoming.length === 0) return null;
  const tierColor = (d:number) => d <= 1 ? "#ff5252" : d <= 2 ? "#ffa600" : d <= 7 ? B.gold : B.muted;
  const tierLabel = (d:number) => d === 0 ? "STARTS TODAY" : d === 1 ? "starts tomorrow" : `starts in ${d} days`;
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ background:B.card, border:`1px solid ${B.gold}44`, borderRadius:10, padding:"12px 14px" }}>
        <p style={{ fontSize:11, fontWeight:700, color:B.gold, letterSpacing:1, textTransform:"uppercase", margin:"0 0 10px" }}>
          🗓️ Upcoming Contract Starts ({upcoming.length})
        </p>
        {upcoming.map((c:any, i:number) => {
          const d = daysUntilStart(c);
          const col = tierColor(d);
          const shownName = <LN>{c.name}</LN>;
          return (
            <div key={c.uuid || c.email || c.name} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"8px 10px", borderRadius:8, background:d <= 7 ? `${col}11` : "transparent",
              border:`1px solid ${d <= 7 ? col+"44" : "transparent"}`, marginBottom:6 }}>
              <div>
                <p style={{ fontSize:13, fontWeight:600, color:B.text, margin:0 }}>{shownName}</p>
                <p style={{ fontSize:11, color:B.muted, margin:"2px 0 0" }}>
                  Start date: {new Date(`${c.startDate}T00:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                  {c.checkInDay ? ` · update day ${c.checkInDay}` : ""}
                </p>
              </div>
              <span style={{ fontSize:11, fontWeight:700, color:col, whiteSpace:"nowrap" }}>
                {d <= 1 ? "⚠️ " : ""}{tierLabel(d)}
              </span>
            </div>
          );
        })}
        <p style={{ fontSize:10, color:B.muted, margin:"6px 0 0" }}>
          These clients aren't counted late on updates until their start date.
        </p>
      </div>
    </div>
  );
};

// ── Coach Dashboard ───────────────────────────────────────────────────────────
const CoachDashboard = ({ user, onNavigate, loomMode, setLoomMode, loomFeatured, followedUp, setFollowedUp }) => {
  const isMobile = useIsMobile();
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [rosterOpen,     setRosterOpen]     = useState(true);
  const [missOpen,       setMissOpen]       = useState(true);
  const [alertClient,    setAlertClient]    = useState<any>(null);
  // Track resolved alert reasons per client email
  const [resolved, setResolved]             = useState<Record<string,Set<string>>>({});
  // Real roster: this coach's active clients from the database
  const [clients, setClients] = useState<any[]>([]);
  useEffect(() => { (async () => {
    try {
      const me = await sbGet('user_profiles', `email=eq.${encodeURIComponent(user.email)}&select=id`);
      const myId = me?.[0]?.id;
      if (!myId) { setClients([]); return; }
      const rows = (await sbGet('user_profiles',
        `coach_id=eq.${myId}&role=eq.client&is_active=not.is.false&select=id,name,email,initials,update_day,start_date&order=name.asc`)) || [];
      // Last check-in per client (single batched query) + whether the latest
      // one still needs a coach review (no coach_reviewed_at yet)
      let lastMap: Record<string,string> = {};
      let reviewMap: Record<string,boolean> = {};
      let lastIdMap: Record<string,string> = {};
      if (rows.length > 0) {
        const ids = rows.map((r:any) => r.id).join(',');
        const cks = (await sbGet('weekly_checkins',
          `client_id=in.(${ids})&select=id,client_id,submitted_at,coach_reviewed_at&order=submitted_at.desc`)) || [];
        for (const ck of cks) if (!lastMap[ck.client_id]) {
          lastMap[ck.client_id] = ck.submitted_at;
          reviewMap[ck.client_id] = !ck.coach_reviewed_at;
          lastIdMap[ck.client_id] = ck.id;
        }
      }
      setClients(rows.map((r:any) => ({
        uuid: r.id, name: r.name || '', email: r.email || '',
        initials: r.initials || (r.name || '?').split(' ').map((w:string)=>w[0]).join('').slice(0,2).toUpperCase(),
        checkInDay: r.update_day || '', startDate: r.start_date || null,
        lastCheckinAt: lastMap[r.id] || null,
        lastCheckinId: lastIdMap[r.id] || null,
        needsReview: !!reviewMap[r.id],
        lastCheckin: lastMap[r.id]
          ? new Date(lastMap[r.id]).toLocaleDateString('en-US',{month:'short',day:'numeric'})
          : '—',
        status: 'Active', nextCheckin: '', alert: false, alertReasons: [],
        tags: [], notes: '', checkinHistory: [], pendingLabs: false, protocol: '', goal: '',
      })));
    } catch (e) { setClients([]); }
  })(); }, [user?.email]);
  // Guard: ensure loomFeatured is always a Set regardless of how the prop arrives
  const featuredSet: Set<string> = (loomFeatured instanceof Set) ? loomFeatured : new Set();

  // Coach's own check-in deadline (each coach sets their own; clients inherit it)
  const [myIds,     setMyIds]     = useState<any>(null);   // { id, companyId } — for my check-in form
  const [formOpen,  setFormOpen]  = useState(false);
  const [myTz,      setMyTz]      = useState(DEFAULT_TZ);
  const [myTime,    setMyTime]    = useState(DEFAULT_TIME);
  const [myTzError, setMyTzError] = useState(false);
  useEffect(() => { (async () => {
    if (!user?.email) return;
    try {
      const rows = await sbGet('user_profiles', `email=eq.${encodeURIComponent(user.email)}&select=id,company_id,timezone,deadline_time`);
      if (Array.isArray(rows) && rows[0]?.timezone)      setMyTz(rows[0].timezone);
      if (Array.isArray(rows) && rows[0]?.deadline_time) setMyTime(rows[0].deadline_time.slice(0,5));
      if (Array.isArray(rows) && rows[0]?.id)            setMyIds({ id: rows[0].id, companyId: rows[0].company_id || EDEN_ORG_ID });
    } catch {}
  })(); }, [user?.email]);

  function resolveItem(email: string, reason: string) {
    setResolved(prev => {
      const set = new Set(prev[email] || []);
      set.add(reason);
      return { ...prev, [email]: set };
    });
  }

  function isAlertActive(c: any): boolean {
    if (!c.alert) return false;
    const done = resolved[c.email] || new Set();
    return (c.alertReasons || []).some((r: string) => !done.has(r));
  }

  // Group clients by check-in day for the missing tracker
  const byDay: Record<string, any[]> = {};
  clients.forEach(c => {
    const day = c.checkInDay || 'Unassigned';
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(c);
  });

  useLoomOn(); // re-render when the global visible-names list changes
  const isFeatured      = (c: any)            => featuredSet.has(c.name) || loomIsShown(c.name);
  const displayName     = (c: any, i: number) => (loomMode && !isFeatured(c)) ? `Client ${String.fromCharCode(65+i)}` : c.name;
  const displayProtocol = (c: any)            => (loomMode && !isFeatured(c)) ? "Protocol hidden" : c.protocol;
  const displayCheckin  = (c: any)            => (loomMode && !isFeatured(c)) ? "—" : c.lastCheckin;

  const missingClients = clients.filter(c => isMissingCheckin(c, { time: myTime, tz: myTz }));

  return (
    <Screen>
      {/* Header */}
      <div style={{ background:`linear-gradient(180deg,#111100 0%,#000000 100%)`, padding:"20px 20px 16px" }}>
        <p style={{ fontSize:11, color:B.muted, fontWeight:700, letterSpacing:1, margin:"0 0 4px" }}>COACH PORTAL</p>
        <h1 style={{ fontSize:22, fontWeight:700, color:B.text, margin:0 }}>{user.name}</h1>
        <p style={{ fontSize:12, color:B.muted, margin:"4px 0 0" }}>Lifestyle of Eden University · {clients.length} active clients</p>
        {loomMode && (
          <div style={{ marginTop:10, padding:"6px 12px", background:"#ff525218", border:"1px solid #ff525244", borderRadius:8 }}>
            <p style={{ fontSize:11, color:"#ff5252", margin:0, fontWeight:600 }}>
              🔴 Loom Mode active —{" "}
              {featuredSet.size > 0
                ? `${featuredSet.size} client${featuredSet.size>1?'s':''} visible, all others hidden`
                : "all client names hidden"}
            </p>
          </div>
        )}
      </div>

      <div style={{ padding:"16px 20px" }}>
        {/* Stat cards */}
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap:10, marginBottom:20 }}>
          {[
            { label:"Total Clients",    val:loomMode?"—":clients.length,         color:B.gold },
            { label:"Missing Check-Ins",val:loomMode?"—":missingClients.length,  color:"#ffa600" },
            { label:"Pending Labs",     val:loomMode?"—":clients.filter((c:any)=>c.pendingLabs).length, color:"#D4A8F0" },
          ].map(({label,val,color})=>(
            <Card key={label} style={{ textAlign:"center" }}>
              <p style={{ fontSize:24, fontWeight:700, color, margin:"0 0 4px" }}>{val}</p>
              <p style={{ fontSize:10, color:B.muted, margin:0, lineHeight:1.3 }}>{label}</p>
            </Card>
          ))}
        </div>

        {/* ── Check-in timezone (coach's own setting) ── */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:8, marginBottom:12 }}>
          <span style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase" }}>My check-in deadline</span>
          {myTzError && <span style={{ fontSize:11, color:"#ff5252", fontWeight:700 }}>⚠ Not saved</span>}
          <input type="time" value={myTime} onChange={async e => {
              const t = e.target.value; if (!t) return;
              const prev = myTime;
              setMyTime(t); setMyTzError(false);
              const ok = await sbPatch('user_profiles', `email=eq.${encodeURIComponent(user.email)}`, { deadline_time: t });
              if (!ok) { setMyTime(prev); setMyTzError(true); return; }
              clearTzCache();
            }}
            style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:8, padding:"6px 10px", color:B.gold, fontSize:12, outline:"none", cursor:"pointer", colorScheme:"dark" }}/>
          <select value={myTz} onChange={async e => {
              const tz = e.target.value; const prev = myTz;
              setMyTz(tz); setMyTzError(false);
              const ok = await sbPatch('user_profiles', `email=eq.${encodeURIComponent(user.email)}`, { timezone: tz });
              if (!ok) { setMyTz(prev); setMyTzError(true); return; }
              clearTzCache();
            }}
            style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:8, padding:"6px 10px", color:B.gold, fontSize:12, outline:"none", cursor:"pointer" }}>
            {TZ_OPTIONS.map((o:any) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* ── My check-in form (coach's own customization) ── */}
        {myIds && (
          <div style={{ background:B.card, border:`1px solid ${formOpen?B.gold+'55':B.border}`, borderRadius:12, marginBottom:16, overflow:'hidden' }}>
            <button onClick={()=>setFormOpen(v=>!v)}
              style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", background:"none", border:"none", cursor:"pointer", padding:"12px 14px" }}>
              <span style={{ fontSize:11, fontWeight:700, color:formOpen?B.gold:B.text, letterSpacing:1, textTransform:"uppercase" }}>📝 My Check-In Form</span>
              <span style={{ fontSize:18, color:B.gold, fontWeight:700, display:"inline-block", transition:"transform .2s", transform: formOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>▾</span>
            </button>
            {formOpen && (
              <div style={{ padding:"0 14px 14px" }}>
                <p style={{ fontSize:11, color:B.muted, margin:"0 0 12px", lineHeight:1.5 }}>
                  Choose which metrics your clients fill in each week. Changes apply to all your clients immediately.
                </p>
                <CheckinFormEditor companyId={myIds.companyId} coachId={myIds.id} coachName="You"/>
              </div>
            )}
          </div>
        )}

        {/* ── Upcoming contract starts ── */}
        <UpcomingStartsSection clients={clients} loomMode={loomMode}/>

        {/* New-client setup prompt: anyone missing a contract start date or update day */}
        {(() => {
          const needsSetup = clients.filter((c:any) => !c.startDate || !c.checkInDay);
          if (needsSetup.length === 0) return null;
          return (
            <div style={{ marginBottom:16 }}>
              <div style={{ background:B.card, border:"1px solid #ffa60066", borderRadius:10, padding:"12px 14px" }}>
                <p style={{ fontSize:11, fontWeight:700, color:"#ffa600", letterSpacing:1, textTransform:"uppercase", margin:"0 0 10px" }}>
                  ⚙️ Needs Setup ({needsSetup.length})
                </p>
                {needsSetup.map((c:any, i:number) => {
                  const missing = [!c.startDate && "contract start date", !c.checkInDay && "update day"].filter(Boolean).join(" and ");
                  return (
                    <div key={c.uuid || c.email}
                      onClick={() => onNavigate && onNavigate('admin', c)}
                      style={{ display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer",
                        padding:"8px 10px", borderRadius:8, background:"#ffa60011", border:"1px solid #ffa60033", marginBottom:6 }}>
                      <div>
                        <p style={{ fontSize:13, fontWeight:600, color:B.text, margin:0 }}>
                          {loomMode ? `Client ${String.fromCharCode(65+i)}` : c.name}
                        </p>
                        <p style={{ fontSize:11, color:B.muted, margin:"2px 0 0" }}>Assign their {missing}</p>
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:"#ffa600", whiteSpace:"nowrap" }}>Set up →</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Missing Check-In Tracker ── */}
        <button onClick={()=>setMissOpen(v=>!v)}
          style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center",
            background: missingClients.length > 0 ? `#ffa60018` : B.card,
            border:`1px solid ${missingClients.length > 0 ? "#ffa60044" : B.border}`,
            borderRadius:10, cursor:"pointer", padding:"12px 14px", marginBottom: missOpen ? 10 : 16 }}>
          <span style={{ fontSize:11, fontWeight:700, color: missingClients.length > 0 ? "#ffa600" : B.text, letterSpacing:1, textTransform:"uppercase" }}>
            {missingClients.length > 0 ? `⚠️ Missing Check-Ins (${loomMode?"—":missingClients.length})` : "✅ Check-In Tracker"}
          </span>
          <span style={{ fontSize:18, color:B.gold, fontWeight:700, display:"inline-block", transition:"transform .2s",
            transform: missOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>▾</span>
        </button>

        {missOpen && (
          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:12, padding:16, marginBottom:16 }}>
            {/* Deadline setting (saved at the top of the dashboard) */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
              <span style={{ fontSize:11, color:B.muted, fontWeight:600 }}>Check-in deadline:</span>
              <span style={{ fontSize:12, color:B.gold, fontWeight:700 }}>{timeLabel(myTime)} {tzShort(myTz)}</span>
              <span style={{ fontSize:10, color:B.muted }}>— clients whose update day passed this time without a submission are flagged (change it at the top of the dashboard)</span>
            </div>

            {/* Group by check-in day — only show clients who are missing */}
            {(() => {
              const anyShown = Object.values(byDay).some((dc: any[]) =>
                dc.some(c => isMissingCheckin(c, { time: myTime, tz: myTz }) && !followedUp.has(c.email))
              );
              if (!anyShown && !loomMode) return (
                <div style={{ textAlign:"center", padding:"20px 0", color:B.success }}>
                  <div style={{ fontSize:28, marginBottom:6 }}>✅</div>
                  <p style={{ fontSize:13, fontWeight:700, margin:0 }}>All clients have checked in</p>
                </div>
              );
              return Object.entries(byDay).sort().map(([day, dayClients]) => {
                const visibleMissing = loomMode
                  ? (dayClients as any[])
                  : (dayClients as any[]).filter(c => isMissingCheckin(c, { time: myTime, tz: myTz }) && !followedUp.has(c.email));
                if (!loomMode && visibleMissing.length === 0) return null;
                return (
                  <div key={day} style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:"#ffa600", letterSpacing:.8, textTransform:"uppercase" }}>{day}</span>
                      <span style={{ fontSize:10, color:B.muted }}>
                        {loomMode ? "—" : `${visibleMissing.length} haven't checked in`}
                      </span>
                    </div>
                    {visibleMissing.map((c: any, i: number) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px",
                        background:"#1a0a00", border:`1px solid #ffa60033`, borderRadius:8, marginBottom:6 }}>
                        <span style={{ fontSize:14, flexShrink:0 }}>⏰</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontSize:12, fontWeight:700, color:B.text, margin:0 }}>
                            {loomMode ? `Client ${String.fromCharCode(65+i)}` : c.name}
                          </p>
                          <p style={{ fontSize:10, color:B.muted, margin:"2px 0 0" }}>
                            {loomMode ? "—" : `Last check-in: ${c.lastCheckin} — hasn't submitted this cycle`}
                          </p>
                        </div>
                        {!loomMode && (
                          <button onClick={()=>{
                            setFollowedUp(prev => { const s = new Set(prev); s.add(c.email); return s; });
                            onNavigate?.("msgs", { email:c.email, name:c.name, role:"client" });
                          }}
                            style={{ background:`${B.gold}22`, border:`1px solid ${B.gold}55`, borderRadius:6,
                              padding:"5px 10px", color:B.gold, fontSize:10, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
                            💬 Follow Up
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* ── My Clients ── */}
        <button onClick={()=>setRosterOpen(v=>!v)}
          style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center",
            background:B.card, border:`1px solid ${B.border}`, borderRadius:10,
            cursor:"pointer", padding:"12px 14px", marginBottom: rosterOpen ? 10 : 0 }}>
          <span style={{ fontSize:11, fontWeight:700, color:B.text, letterSpacing:1, textTransform:"uppercase" }}>
            👥 My Clients {loomMode && <span style={{ color:"#ff5252" }}>· hidden</span>}
          </span>
          <span style={{ fontSize:18, color:B.gold, fontWeight:700, display:"inline-block", transition:"transform .2s",
            transform: rosterOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>▾</span>
        </button>

        {rosterOpen && (
          <>
            {[...clients].sort((a:any,b:any)=>(b.needsReview?1:0)-(a.needsReview?1:0)).map((c,i)=>{
              const alertOn = isAlertActive(c);
              // Opening a client with a new check-in clears the highlight (the
              // modal has a "remind me" button to flag it as new again)
              const openClient = () => {
                if (c.needsReview && c.lastCheckinId) {
                  sbPatch('weekly_checkins', `id=eq.${c.lastCheckinId}`, { coach_reviewed_at: new Date().toISOString() });
                  setClients((prev:any[])=>prev.map((x:any)=>x.uuid===c.uuid?{...x,needsReview:false}:x));
                  setSelectedClient({ ...c, needsReview:false });
                } else setSelectedClient(c);
              };
              return (
                <div key={i} style={{ width:"100%", background:B.card,
                  border:`1px solid ${B.border}`,
                  borderLeft:`3px solid ${(!loomMode && alertOn) ? B.gold : (!loomMode && c.alert===false) ? B.success : B.border}`,
                  borderRadius:14, padding:"14px 16px", marginBottom:10, boxSizing:"border-box" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ flex:1, minWidth:0, cursor:"pointer" }}
                      onClick={openClient}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <p style={{ fontSize:14, fontWeight:700, color:B.text, margin:0 }}>{displayName(c,i)}</p>
                        {!loomMode && c.needsReview && (
                          <span style={{ fontSize:9, fontWeight:800, color:B.black, background:B.gold,
                            borderRadius:4, padding:"2px 6px", letterSpacing:.5, whiteSpace:"nowrap" }}>📋 NEW CHECK-IN</span>
                        )}
                        {!loomMode && c.checkInDay && (
                          <span style={{ fontSize:9, color:B.muted, background:B.surface, border:`1px solid ${B.border}`,
                            borderRadius:4, padding:"1px 5px", fontWeight:600 }}>{c.checkInDay}</span>
                        )}
                      </div>
                      <p style={{ fontSize:11, color:B.muted, margin:"0 0 4px" }}>Last check-in: {displayCheckin(c)}</p>
                      <p style={{ fontSize:10, color:B.muted, margin:0, fontStyle:"italic" }}>{displayProtocol(c)}</p>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6, flexShrink:0, marginLeft:12 }}>
                      {!loomMode && (
                        <Badge color={alertOn ? B.gold : B.success}>
                          {alertOn ? c.status : "Active"}
                        </Badge>
                      )}
                      {!loomMode && alertOn && (c.alertReasons||[]).length > 0 && (
                        <button
                          onClick={e=>{ e.stopPropagation(); setAlertClient(c); }}
                          style={{ background:`${B.gold}22`, border:`1px solid ${B.gold}66`,
                            borderRadius:6, padding:"4px 10px", color:B.gold,
                            fontSize:10, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                          ⚠️ View Alerts
                        </button>
                      )}
                      <span style={{ fontSize:11, color:B.gold, cursor:"pointer" }}
                        onClick={openClient}>View →</span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop:6, textAlign:"center", fontSize:11, color:B.muted, padding:"8px 0" }}>
              New clients are added automatically when their GHL contract is signed.
            </div>
          </>
        )}
      </div>

      {selectedClient && (
        <ClientDetailModal client={selectedClient} onClose={()=>setSelectedClient(null)} onNavigate={onNavigate}
          onSaved={(uuid:string, patch:any)=>setClients((prev:any[])=>prev.map((c:any)=>c.uuid===uuid?{...c,...patch}:c))}
          onFlagUnreviewed={async ()=>{
            if (!selectedClient?.lastCheckinId) return false;
            const ok = await sbPatch('weekly_checkins', `id=eq.${selectedClient.lastCheckinId}`, { coach_reviewed_at: null });
            if (ok) {
              setClients((prev:any[])=>prev.map((c:any)=>c.uuid===selectedClient.uuid?{...c,needsReview:true}:c));
              setSelectedClient((s:any)=>s?{...s,needsReview:true}:s);
            }
            return ok;
          }}/>
      )}
      {alertClient && (
        <AlertDetailModal
          client={alertClient}
          resolved={resolved[alertClient.email] || new Set()}
          onResolve={r => resolveItem(alertClient.email, r)}
          onClose={()=>setAlertClient(null)}
        />
      )}
    </Screen>
  );
};

// SUPER ADMIN VIEW
// ─── SUPABASE HELPERS (admin components) ─────────────────────────────────────
const SB_URL  = 'https://jzdoojlwgpqlmworwcsr.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU';
const SB_H    = { 'apikey':SB_ANON, get Authorization(){ return sbBearer() }, 'Content-Type':'application/json', 'Prefer':'return=representation' };
async function sbGet(table:string, params='') {
  try { const r=await fetch(`${SB_URL}/rest/v1/${table}?${params}`,{headers:SB_H}); if(!r.ok) return []; return r.json(); } catch { return []; }
}
async function sbInsert(table:string, body:any) {
  try { const r=await fetch(`${SB_URL}/rest/v1/${table}`,{method:'POST',headers:SB_H,body:JSON.stringify(body)}); if(!r.ok) return null; const t=await r.text(); return t?JSON.parse(t):null; } catch { return null; }
}
// Returns true only when the PATCH succeeded AND at least one row was actually
// updated (SB_H sends Prefer: return=representation, so the response body holds
// the updated rows — an empty array means RLS silently rejected the write).
async function sbPatch(table:string, params:string, body:any):Promise<boolean> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?${params}`,{method:'PATCH',headers:SB_H,body:JSON.stringify(body)});
    if (!r.ok) { console.error('PATCH', table, await r.text().catch(()=> '')); return false; }
    const t = await r.text();
    const rows = t ? JSON.parse(t) : [];
    if (Array.isArray(rows) && rows.length === 0) { console.error('PATCH', table, '0 rows updated (blocked by RLS?)'); return false; }
    return true;
  } catch (e) { console.error('PATCH', table, e); return false; }
}
async function sbDelete(table:string, params:string) {
  try { await fetch(`${SB_URL}/rest/v1/${table}?${params}`,{method:'DELETE',headers:SB_H}); } catch {}
}
// Upload an org logo to Supabase Storage (bucket: org-logos) and return its public URL, or null if unavailable
async function sbUploadLogo(orgId:string, file:File):Promise<string|null> {
  try {
    const ext  = ((file.name.split('.').pop()||'png').toLowerCase().replace(/[^a-z0-9]/g,''))||'png';
    const path = `${orgId}-${Date.now()}.${ext}`;
    const r = await fetch(`${SB_URL}/storage/v1/object/org-logos/${path}`,{
      method:'POST',
      headers:{ 'apikey':SB_ANON, get Authorization(){ return sbBearer() }, 'Content-Type':file.type||'image/png' },
      body:file,
    });
    if (!r.ok) return null;
    return `${SB_URL}/storage/v1/object/public/org-logos/${path}`;
  } catch { return null; }
}

// ─── STAFF ACCESS MANAGER ─────────────────────────────────────────────────────
const PERM_DEFS = [
  { key:'messages', label:'Messages',  icon:'💬', color:'#6FB8E8' },
  { key:'diet',     label:'Diet',      icon:'🥗', color:'#4FD89A' },
  { key:'labs',     label:'Labs',      icon:'🔬', color:'#D4A8F0' },
  { key:'workout',  label:'Workout',   icon:'🏋️', color:'#f06060' },
  { key:'checkins', label:'Check-ins', icon:'✅', color:B.gold    },
  { key:'habits',   label:'Habits',    icon:'🌱', color:'#88ddaa' },
  { key:'coach_convo', label:'Coach Convo', icon:'👁', color:'#e8b76f' },
];
const DEFAULT_PERMS:any = { messages:true, diet:false, labs:false, workout:false, checkins:false, habits:false, coach_convo:false };

const FALLBACK_STAFF:any[]   = [];
const FALLBACK_CLIENTS:any[] = [];

const StaffAccessManager = ({ user }:any) => {
  const [companyId,   setCompanyId]   = useState<string|null>(null);
  const [adminId,     setAdminId]     = useState<string|null>(null);
  const [staffList,   setStaffList]   = useState<any[]>(FALLBACK_STAFF);
  const [clientList,  setClientList]  = useState<any[]>(FALLBACK_CLIENTS);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [showModal,   setShowModal]   = useState(false);
  const [editing,     setEditing]     = useState<any>(null);
  const [saving,      setSaving]      = useState(false);
  const [usingDemo,   setUsingDemo]   = useState(true);
  const [fStaff,  setFStaff]  = useState('');
  const [fClient, setFClient] = useState('all');
  const [fPerms,  setFPerms]  = useState<any>({...DEFAULT_PERMS});

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const rows:any[] = await sbGet('user_profiles', `email=eq.${encodeURIComponent(user.email)}&select=id,company_id`);
    const me = rows?.[0];
    if (!me?.company_id) return;
    setCompanyId(me.company_id); setAdminId(me.id); setUsingDemo(false);
    const [sf, cl, ass] = await Promise.all([
      sbGet('user_profiles', `company_id=eq.${me.company_id}&role=neq.client&is_active=not.is.false&select=id,name,role,initials,email`),
      sbGet('user_profiles', `company_id=eq.${me.company_id}&role=eq.client&is_active=not.is.false&select=id,name,initials`),
      sbGet('client_access', `company_id=eq.${me.company_id}&select=*`),
    ]);
    if (sf?.length)         setStaffList(sf);
    if (cl?.length)         setClientList(cl);
    if (Array.isArray(ass)) setAssignments(ass);
  }

  function openAdd() {
    setEditing(null); setFStaff(staffList[0]?.id||''); setFClient('all'); setFPerms({...DEFAULT_PERMS}); setShowModal(true);
  }
  function openEdit(a:any) {
    setEditing(a); setFStaff(a.staff_id); setFClient(a.client_id||'all'); setFPerms({...DEFAULT_PERMS,...a.permissions}); setShowModal(true);
  }

  async function save() {
    if (!fStaff && !editing) return;
    setSaving(true);
    if (editing) {
      if (!usingDemo) {
        const ok = await sbPatch('client_access', `id=eq.${editing.id}`, { permissions:fPerms });
        if (!ok) { setSaving(false); alert("Couldn't save these permissions — try again."); return; }
      }
      setAssignments(p => p.map(a => a.id===editing.id ? {...a,permissions:fPerms} : a));
    } else {
      const isCoachPick = fClient.startsWith('coach:');
      const payload:any = { company_id:companyId, staff_id:fStaff,
        client_id: (fClient==='all'||isCoachPick) ? null : fClient,
        coach_id:  isCoachPick ? fClient.slice(6) : null,
        permissions:fPerms, assigned_by:adminId };
      // Same staff + same target already assigned? Update it instead of duplicating.
      const dup = assignments.find((a:any) => a.staff_id===fStaff &&
        (a.client_id||null)===(payload.client_id||null) && (a.coach_id||null)===(payload.coach_id||null));
      if (dup) {
        if (!usingDemo) {
          const ok = await sbPatch('client_access', `id=eq.${dup.id}`, { permissions:fPerms });
          if (!ok) { setSaving(false); alert("Couldn't save these permissions — try again."); return; }
        }
        setAssignments(p => p.map(a => a.id===dup.id ? {...a,permissions:fPerms} : a));
        setSaving(false); setShowModal(false); return;
      }
      if (!usingDemo) {
        const res:any = await sbInsert('client_access', payload);
        if (res?.[0]) setAssignments(p => [...p, res[0]]);
      } else {
        setAssignments(p => [...p, {...payload, id:`demo-${Date.now()}`}]);
      }
    }
    setSaving(false); setShowModal(false);
  }

  async function remove(a:any) {
    if (!window.confirm(`Remove ${staffName(a.staff_id)}'s access to ${clientLabel(a.client_id)}?`)) return;
    if (!usingDemo) await sbDelete('client_access', `id=eq.${a.id}`);
    setAssignments(p => p.filter(x => x.id!==a.id));
  }

  const staffName  = (id:string) => staffList.find(s=>s.id===id)?.name    || '—';
  const staffInit  = (id:string) => staffList.find(s=>s.id===id)?.initials || '?';
  const staffRole  = (id:string) => (staffList.find(s=>s.id===id)?.role||'').replace(/_/g,' ');
  const clientLabel = (id:string|null) => id ? (clientList.find(c=>c.id===id)?.name||id) : '👥 All Clients';
  const assignLabel = (a:any) => a?.coach_id
    ? `🏋 All clients of ${staffList.find(s=>s.id===a.coach_id)?.name || 'coach'}`
    : clientLabel(a?.client_id ?? null);
  const coachOptions = staffList.filter((s:any)=>s.role==='coach'||s.role==='head_coach');

  const grouped = staffList
    .map(s => ({ staff:s, rows:assignments.filter(a=>a.staff_id===s.id) }))
    .filter(g => g.rows.length > 0);

  return (
    <div style={{ padding:'16px 20px 60px' }}>
      {/* Toolbar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:'uppercase', margin:'0 0 2px' }}>Staff Access Control</p>
          {usingDemo && <p style={{ fontSize:10, color:'#f06060', margin:0 }}>⚠️ Demo mode — populate user_profiles in Supabase to persist</p>}
        </div>
        <button onClick={openAdd} style={{ background:B.gold, border:'none', borderRadius:8, padding:'8px 14px', color:B.black, fontSize:12, fontWeight:800, cursor:'pointer' }}>
          + Add Assignment
        </button>
      </div>

      {/* Empty state */}
      {grouped.length === 0 && (
        <Card>
          <div style={{ textAlign:'center', padding:'28px 0' }}>
            <div style={{ fontSize:36, marginBottom:10 }}>👥</div>
            <p style={{ fontSize:14, fontWeight:700, color:B.muted, margin:'0 0 6px' }}>No staff assignments yet</p>
            <p style={{ fontSize:11, color:B.muted, margin:0, lineHeight:1.6 }}>Assign VAs, head coaches, or staff to clients.<br/>They'll appear in each other's Messages and see only what you allow.</p>
          </div>
        </Card>
      )}

      {/* Assignment groups */}
      {grouped.map(({ staff, rows }) => (
        <div key={staff.id} style={{ marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <div style={{ width:36, height:36, borderRadius:18, background:B.goldDim, border:`1px solid ${B.goldMid}`,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:B.gold }}>
              {staff.initials}
            </div>
            <div>
              <p style={{ fontSize:13, fontWeight:700, color:B.text, margin:0 }}><LN>{staff.name}</LN></p>
              <p style={{ fontSize:10, color:B.muted, margin:0, textTransform:'capitalize' }}>{staffRole(staff.id)}</p>
            </div>
          </div>

          {rows.map((a:any) => {
            const active = PERM_DEFS.filter(p => a.permissions?.[p.key]);
            return (
              <Card key={a.id} style={{ marginBottom:8, marginLeft:46 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:12, fontWeight:700, color:B.text, margin:'0 0 8px' }}>{assignLabel(a)}</p>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                      {active.length===0 && <span style={{ fontSize:10, color:B.muted }}>No permissions enabled</span>}
                      {active.map((p:any) => (
                        <span key={p.key} style={{ fontSize:10, fontWeight:700, color:p.color, background:`${p.color}18`, border:`1px solid ${p.color}44`, borderRadius:12, padding:'2px 8px' }}>
                          {p.icon} {p.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <button onClick={()=>openEdit(a)} style={{ background:`${B.gold}22`, border:`1px solid ${B.goldMid}`, borderRadius:6, padding:'5px 10px', color:B.gold, fontSize:11, fontWeight:700, cursor:'pointer' }}>Edit</button>
                    <button onClick={()=>remove(a)} style={{ background:'#ff444415', border:'1px solid #ff444433', borderRadius:6, padding:'5px 10px', color:'#ff7070', fontSize:11, fontWeight:700, cursor:'pointer' }}>×</button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ))}

      {/* Modal */}
      {showModal && (
        <div onClick={e=>{if(e.target===e.currentTarget)setShowModal(false)}}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:300, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:'16px 16px 0 0', padding:20, width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <p style={{ fontSize:15, fontWeight:800, color:B.text, margin:0 }}>{editing?'Edit Permissions':'Assign Staff Member'}</p>
              <button onClick={()=>setShowModal(false)} style={{ background:'none', border:'none', color:B.muted, fontSize:24, cursor:'pointer', padding:0, lineHeight:1 }}>×</button>
            </div>

            {!editing && (<>
              {/* Staff picker */}
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:'uppercase', display:'block', marginBottom:6 }}>Staff Member</label>
                <select value={fStaff} onChange={e=>setFStaff(e.target.value)}
                  style={{ width:'100%', background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:'10px 12px', color:B.text, fontSize:13, outline:'none' }}>
                  <option value=''>— Select —</option>
                  {staffList.map((s:any) => <option key={s.id} value={s.id}>{s.name} ({(s.role||'').replace(/_/g,' ')})</option>)}
                </select>
              </div>
              {/* Client picker */}
              <div style={{ marginBottom:18 }}>
                <label style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:'uppercase', display:'block', marginBottom:6 }}>Assign To</label>
                <select value={fClient} onChange={e=>setFClient(e.target.value)}
                  style={{ width:'100%', background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:'10px 12px', color:B.text, fontSize:13, outline:'none' }}>
                  <option value='all'>👥 All Clients (company-wide)</option>
                  {coachOptions.length>0 && (
                    <optgroup label="A coach's clients (auto-includes future clients)">
                      {coachOptions.map((s:any) => <option key={`coach:${s.id}`} value={`coach:${s.id}`}>🏋 All clients of {s.name}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Specific client">
                    {clientList.map((c:any) => <option key={c.id} value={c.id}>👤 {c.name}</option>)}
                  </optgroup>
                </select>
              </div>
            </>)}

            {editing && (
              <div style={{ padding:'10px 12px', background:B.surface, borderRadius:8, marginBottom:18 }}>
                <p style={{ fontSize:12, color:B.muted, margin:'0 0 2px' }}>Editing access for</p>
                <p style={{ fontSize:13, fontWeight:700, color:B.gold, margin:0 }}>{staffName(editing.staff_id)} → {assignLabel(editing)}</p>
              </div>
            )}

            {/* Permission toggles */}
            <label style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:'uppercase', display:'block', marginBottom:10 }}>What Can They See?</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:20 }}>
              {PERM_DEFS.map((p:any) => {
                const on = !!fPerms[p.key];
                return (
                  <button key={p.key} onClick={()=>setFPerms((prev:any)=>({...prev,[p.key]:!prev[p.key]}))}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
                      background: on?`${p.color}18`:B.surface, border:`1px solid ${on?p.color:B.border}`,
                      borderRadius:10, cursor:'pointer', textAlign:'left' }}>
                    <span style={{ fontSize:18 }}>{p.icon}</span>
                    <div>
                      <p style={{ fontSize:12, fontWeight:700, color:on?p.color:B.muted, margin:0 }}>{p.label}</p>
                      <p style={{ fontSize:9, color:on?p.color:B.border, margin:0 }}>{on?'Allowed':'Hidden'}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <button onClick={save} disabled={saving||(!editing&&!fStaff)}
              style={{ width:'100%', background:B.gold, border:'none', borderRadius:10, padding:'13px', color:B.black, fontSize:14, fontWeight:800, cursor:'pointer', opacity:(saving||(!editing&&!fStaff))?0.4:1 }}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Assign Access'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Roster Import / Export (CSV) — move a whole business in one upload ──────
// Header names are matched loosely so exports from other systems "just work".
const CSV_HEADER_MAP:Record<string,string> = {
  name:'name', 'full name':'name', 'client name':'name', 'full_name':'name',
  email:'email', 'email address':'email', 'e-mail':'email',
  role:'role', type:'role', 'user type':'role',
  coach:'coach_email', 'coach email':'coach_email', coach_email:'coach_email',
  'assigned coach':'coach_email', 'coach e-mail':'coach_email',
  phone:'phone', 'phone number':'phone', mobile:'phone',
  'start date':'start_date', start_date:'start_date', 'contract start':'start_date', start:'start_date',
};
// Minimal RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF)
function parseCsv(text:string):string[][] {
  const rows:string[][] = []; let row:string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i+1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i+1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}
const csvCell = (v:any) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
const downloadFile = (filename:string, content:string) => {
  const blob = new Blob([content], { type:'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
};

const RosterImportExport = () => {
  const fileRef = useRef<HTMLInputElement|null>(null);
  const [preview, setPreview]   = useState<any|null>(null);  // { rows, coaches, clients, issues }
  const [sendEmails, setSendEmails] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult]     = useState<any|null>(null);  // server report
  const [exporting, setExporting] = useState(false);

  async function exportRoster() {
    setExporting(true);
    try {
      const people:any[] = await sbGet('user_profiles',
        'role=in.(coach,head_coach,client)&is_active=not.is.false&select=name,email,role,phone,start_date,coach_id&order=role.desc,name.asc');
      // coach_id → coach email lookup
      const idToEmail:Record<string,string> = {};
      const all:any[] = await sbGet('user_profiles','role=in.(coach,head_coach)&select=id,email');
      all.forEach(c => { idToEmail[c.id] = c.email || ''; });
      const header = ['name','email','role','coach_email','phone','start_date'];
      const lines = [header.join(',')];
      people.forEach(p => lines.push([
        csvCell(p.name), csvCell(p.email), csvCell(p.role),
        csvCell(p.role === 'client' ? (idToEmail[p.coach_id] || '') : ''),
        csvCell(p.phone || ''), csvCell(p.start_date || ''),
      ].join(',')));
      downloadFile(`roster-${new Date().toISOString().slice(0,10)}.csv`, lines.join('\n'));
    } finally { setExporting(false); }
  }

  function onFile(f:File|null) {
    setResult(null); setPreview(null);
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const grid = parseCsv(String(reader.result || ''));
      if (grid.length < 2) { setPreview({ rows:[], coaches:0, clients:0, issues:['The file looks empty — it needs a header row plus at least one person.'] }); return; }
      const header = grid[0].map(h => CSV_HEADER_MAP[h.trim().toLowerCase()] || '');
      if (!header.includes('email') || !header.includes('name')) {
        setPreview({ rows:[], coaches:0, clients:0, issues:['Couldn\'t find "name" and "email" columns. The header row should include at least: name, email (optionally role, coach email, phone, start date).'] });
        return;
      }
      const rows:any[] = []; const issues:string[] = []; const seen = new Set<string>();
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      grid.slice(1).forEach((cells, i) => {
        const r:any = {};
        header.forEach((key, j) => { if (key) r[key] = (cells[j] || '').trim(); });
        r.email = (r.email || '').toLowerCase();
        r.role = (r.role || 'client').toLowerCase().replace(/\s+/g,'_');
        if (!['coach','head_coach','client'].includes(r.role)) r.role = 'client';
        r.coach_email = (r.coach_email || '').toLowerCase();
        if (!r.name || !r.email) { issues.push(`Row ${i+2}: missing name or email — will be skipped`); return; }
        if (!emailRe.test(r.email)) { issues.push(`Row ${i+2}: "${r.email}" doesn't look like an email — will be skipped`); return; }
        if (seen.has(r.email)) { issues.push(`Row ${i+2}: ${r.email} appears twice in the file — only the first is used`); return; }
        seen.add(r.email);
        rows.push(r);
      });
      // Clients pointing at a coach that's neither in the file nor (checked server-side) on the team
      const fileCoaches = new Set(rows.filter(r => r.role !== 'client').map(r => r.email));
      rows.forEach(r => {
        if (r.role === 'client' && r.coach_email && !fileCoaches.has(r.coach_email))
          issues.push(`${r.name}: coach ${r.coach_email} isn't in this file — must already be on your team, or this row will fail`);
      });
      setPreview({
        rows,
        coaches: rows.filter(r => r.role !== 'client').length,
        clients: rows.filter(r => r.role === 'client').length,
        issues,
      });
    };
    reader.readAsText(f);
  }

  async function runImport() {
    if (!preview?.rows?.length || importing) return;
    setImporting(true);
    try {
      const r = await fetch('/api/admin/bulk-import', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization: sbBearer() },
        body: JSON.stringify({ rows: preview.rows, send_emails: sendEmails }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok || !body?.ok) {
        setResult({ error: body?.error || `Import failed (${r.status}) — nothing may have been created. Try again.` });
      } else {
        setResult(body);
        setPreview(null);
        if (fileRef.current) fileRef.current.value = '';
      }
    } catch {
      setResult({ error:'Could not reach the server — check your connection and try again.' });
    } finally { setImporting(false); }
  }

  const withTempPw = (result?.report || []).filter((x:any) => x.temp_password);

  return (
    <Card style={{ marginBottom:20 }}>
      <p style={{ fontSize:11, fontWeight:700, color:B.gold, letterSpacing:1, textTransform:'uppercase', margin:'0 0 4px' }}>📋 Bulk Import / Export</p>
      <p style={{ fontSize:11, color:B.muted, margin:'0 0 12px', lineHeight:1.5 }}>
        Moving from another system? Upload one CSV with your whole roster — coaches are created first, then each client
        is placed under their coach automatically. Columns: <b>name, email</b>, and optionally role (coach/client),
        coach email, phone, start date. You can also download your current roster anytime.
      </p>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom: preview || result ? 12 : 0 }}>
        <button onClick={() => fileRef.current?.click()}
          style={{ background:B.gold, border:'none', borderRadius:8, padding:'9px 14px', color:B.black, fontSize:12, fontWeight:800, cursor:'pointer' }}>
          ⬆ Upload CSV…
        </button>
        <button onClick={exportRoster} disabled={exporting}
          style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, padding:'9px 14px', color:B.text, fontSize:12, fontWeight:700, cursor:'pointer', opacity:exporting?0.5:1 }}>
          {exporting ? 'Preparing…' : '⬇ Download current roster'}
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display:'none' }}
          onChange={e => onFile(e.target.files?.[0] || null)} />
      </div>

      {preview && (
        <div style={{ borderTop:`1px solid ${B.border}`, paddingTop:12 }}>
          <p style={{ fontSize:13, color:B.text, margin:'0 0 6px', fontWeight:700 }}>
            Found {preview.coaches} coach{preview.coaches === 1 ? '' : 'es'} and {preview.clients} client{preview.clients === 1 ? '' : 's'} to import.
          </p>
          {preview.issues.length > 0 && (
            <div style={{ background:`${B.gold}11`, border:`1px solid ${B.gold}33`, borderRadius:8, padding:'8px 10px', margin:'0 0 10px' }}>
              {preview.issues.slice(0,8).map((s:string, i:number) => (
                <p key={i} style={{ fontSize:11, color:B.gold, margin:'2px 0' }}>⚠ {s}</p>
              ))}
              {preview.issues.length > 8 && <p style={{ fontSize:11, color:B.muted, margin:'2px 0' }}>…and {preview.issues.length - 8} more</p>}
            </div>
          )}
          {preview.rows.length > 0 && (
            <>
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:B.text, margin:'0 0 10px', cursor:'pointer' }}>
                <input type="checkbox" checked={sendEmails} onChange={e => setSendEmails(e.target.checked)} />
                Email everyone their login details (they set their own password on first sign-in)
              </label>
              <button onClick={runImport} disabled={importing}
                style={{ background:B.success, border:'none', borderRadius:8, padding:'10px 16px', color:'#000', fontSize:13, fontWeight:800, cursor:'pointer', opacity:importing?0.6:1 }}>
                {importing ? 'Importing… this can take a minute' : `Import ${preview.rows.length} ${preview.rows.length === 1 ? 'person' : 'people'}`}
              </button>
            </>
          )}
        </div>
      )}

      {result && (
        <div style={{ borderTop:`1px solid ${B.border}`, paddingTop:12 }}>
          {result.error ? (
            <p style={{ fontSize:12, color:'#f87171', margin:0 }}>✕ {result.error}</p>
          ) : (
            <>
              <p style={{ fontSize:13, color:B.text, margin:'0 0 8px', fontWeight:700 }}>
                ✓ Done — {result.created} created{result.skipped ? `, ${result.skipped} skipped (already existed)` : ''}{result.errors ? `, ${result.errors} failed` : ''}.
              </p>
              {(result.report || []).filter((x:any) => x.status === 'error').slice(0,8).map((x:any, i:number) => (
                <p key={i} style={{ fontSize:11, color:'#f87171', margin:'2px 0' }}>✕ {x.name} ({x.email}): {x.detail}</p>
              ))}
              {withTempPw.length > 0 && (
                <div style={{ background:`${B.gold}11`, border:`1px solid ${B.gold}33`, borderRadius:8, padding:'8px 10px', marginTop:8 }}>
                  <p style={{ fontSize:11, color:B.gold, margin:'0 0 6px', fontWeight:700 }}>
                    ⚠ These logins were created but not emailed — download and share them manually (shown only once):
                  </p>
                  <button onClick={() => downloadFile('login-details.csv',
                      ['name,email,temp_password', ...withTempPw.map((x:any) => [csvCell(x.name), csvCell(x.email), csvCell(x.temp_password)].join(','))].join('\n'))}
                    style={{ background:B.gold, border:'none', borderRadius:6, padding:'6px 12px', color:B.black, fontSize:11, fontWeight:800, cursor:'pointer' }}>
                    ⬇ Download login details
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
};

// ─── ADMIN CONVERSATION MONITOR ──────────────────────────────────────────────
// ── Admin Activity Log — who did what, and when ──────────────────
const ACTION_LABELS:Record<string,{label:string,icon:string}> = {
  message_deleted:    { label:'Message deleted',    icon:'🗑' },
  community_archived: { label:'Community archived', icon:'📦' },
  community_created:  { label:'Community created',  icon:'➕' },
  course_granted:     { label:'Course granted',     icon:'🎓' },
  course_revoked:     { label:'Course revoked',     icon:'🚫' },
  client_deactivated: { label:'Client deactivated', icon:'⏸' },
  client_reactivated: { label:'Client reactivated', icon:'▶️' },
  client_transferred: { label:'Client transferred', icon:'🔁' },
  community_restored: { label:'Community restored', icon:'♻️' },
  message_restored:   { label:'Message restored',   icon:'♻️' },
  login:              { label:'Logged in',          icon:'🔐' },
  login_failed:       { label:'Failed login attempt', icon:'⚠️' },
  checkin_submitted:  { label:'Check-in submitted', icon:'📋' },
  checkin_day_changed:{ label:'Check-in day changed', icon:'🗓' },
  community_renamed:  { label:'Community renamed',  icon:'✏️' },
  invite_resent:      { label:'Invite re-sent',     icon:'✉️' },
  invite_revoked:     { label:'Invite revoked',     icon:'🗑️' },
  user_added:         { label:'User added',         icon:'👤' },
  staff_removed:      { label:'Staff removed',      icon:'👋' },
  staff_updated:      { label:'Staff title/access changed', icon:'🛠' },
  staff_promoted:     { label:'Promoted to Head Coach', icon:'⭐' },
  staff_demoted:      { label:'Head Coach removed', icon:'⬇️' },
  org_updated:        { label:'Organization updated', icon:'🏢' },
  package_added:      { label:'Package added',      icon:'📦' },
  package_updated:    { label:'Package updated',    icon:'📦' },
  package_deleted:    { label:'Package removed',    icon:'📦' },
  start_date_changed: { label:'Start date changed', icon:'🗓' },
  // DBA (sub-brand) activity — written by the API server
  dba_created:                  { label:'DBA created',                    icon:'🏷' },
  dba_updated:                  { label:'DBA updated',                    icon:'🏷' },
  dba_archived:                 { label:'DBA archived',                   icon:'📦' },
  dba_restored:                 { label:'DBA restored',                   icon:'♻️' },
  dba_member_added:             { label:'DBA member invited',             icon:'👤' },
  dba_member_removed:           { label:'DBA member removed',             icon:'👋' },
  dba_member_promoted:          { label:'DBA member promoted to client',  icon:'⭐' },
  dba_staff_access_changed:     { label:'DBA staff access changed',       icon:'🛠' },
  dba_channel_created:          { label:'DBA channel created',            icon:'➕' },
  dba_channel_renamed:          { label:'DBA channel renamed',            icon:'✏️' },
  dba_channel_archived:         { label:'DBA channel archived',           icon:'📦' },
  dba_channel_member_added:     { label:'DBA channel member added',       icon:'👤' },
  dba_channel_member_removed:   { label:'DBA channel member removed',     icon:'👋' },
  dba_channel_audience_changed: { label:'DBA channel audience changed',   icon:'👥' },
  dba_dm_gate_changed:          { label:'DBA 1-on-1 messaging changed',   icon:'💬' },
  dba_tier_defs_changed:        { label:'DBA membership tiers edited',    icon:'🎚' },
  dba_tier_assigned:            { label:'DBA member tier changed',        icon:'🎚' },
  dba_authority_changed:        { label:'DBA leader authority changed',   icon:'🛡' },
  dba_calendar_authority_changed:{ label:'DBA calendar authority changed', icon:'🗓' },
  dba_event_created:            { label:'DBA event added',                icon:'🗓' },
  dba_event_updated:            { label:'DBA event updated',              icon:'🗓' },
  dba_event_deleted:            { label:'DBA event deleted',              icon:'🗑' },
  dba_booking_link_set:         { label:'DBA booking calendar updated',   icon:'📅' },
  dba_message_deleted:          { label:'DBA message deleted',            icon:'🗑' },
  dba_message_pinned:           { label:'DBA message pinned',             icon:'📌' },
  dba_message_unpinned:         { label:'DBA message unpinned',           icon:'📌' },
  dba_huddle_started:           { label:'DBA huddle started',             icon:'🎥' },
  dba_huddle_ended:             { label:'DBA huddle ended',               icon:'🎥' },
  dba_connect_updated:          { label:'DBA Connect links updated',      icon:'🔗' },
  dba_learn_updated:            { label:'DBA Learn courses updated',      icon:'📚' },
};
const actionMeta = (a:string) => ACTION_LABELS[a] || { label:(a||'action').replace(/_/g,' '), icon:'•' };
const centralTime = (iso:string) => {
  try {
    return new Date(iso).toLocaleString('en-US', { timeZone:'America/Chicago',
      month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) + ' CT';
  } catch { return iso; }
};

// Which table holds a soft-deleted/archived item, per audit target_type
const RESTORE_TABLE:Record<string,string> = {
  community: 'communities', community_message: 'community_messages',
  team_message: 'team_messages', message: 'messages',
};

const AdminActivityLog = ({ user }:any) => {
  const [rows, setRows]     = useState<any[]|null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState<string|null>(null);   // expanded entry
  const [restoring, setRestoring] = useState<string|null>(null);
  const [restoredIds, setRestoredIds] = useState<Set<string>>(new Set()); // audit row ids restored this visit

  const [myId, setMyId] = useState<string|null>(null);

  useEffect(() => {
    let alive = true;
    sbGet('audit_logs', 'select=*&order=created_at.desc&limit=300')
      .then((r:any[]) => { if (alive) setRows(Array.isArray(r) ? r : []); });
    if (user?.email) sbGet('user_profiles', `email=eq.${encodeURIComponent(user.email)}&select=id`)
      .then((r:any[]) => { if (alive && r?.[0]?.id) setMyId(r[0].id); }).catch(()=>{});
    return () => { alive = false; };
  }, []);

  // Restorable = an archive/delete event pointing at a known table, not already undone by a later restore event
  const undoneTargets = useMemo(() => {
    const s = new Set<string>();
    (rows||[]).forEach(r => { if (r.action==='community_restored'||r.action==='message_restored') s.add(`${r.target_type}:${r.target_id}`); });
    return s;
  }, [rows]);
  const canRestore = (r:any) =>
    (r.action==='community_archived' || r.action==='message_deleted') &&
    r.target_id && RESTORE_TABLE[r.target_type] &&
    !undoneTargets.has(`${r.target_type}:${r.target_id}`) && !restoredIds.has(r.id);

  async function restore(r:any) {
    const table = RESTORE_TABLE[r.target_type];
    const label = r.target_type==='community' ? `community "${r.details?.name||''}"` : 'this message';
    if (!window.confirm(`Restore ${label}? It will become visible again.`)) return;
    setRestoring(r.id);
    const patch = r.target_type==='community'
      ? { is_active: true }
      : { deleted_at: null, deleted_by: null, deleted_by_name: null };
    const ok = await sbPatch(table, `id=eq.${r.target_id}`, patch);
    setRestoring(null);
    if (!ok) { alert("Couldn't restore — the item may no longer exist."); return; }
    setRestoredIds(prev => new Set(prev).add(r.id));
    // Log the restore itself
    const entry = {
      action: r.target_type==='community' ? 'community_restored' : 'message_restored',
      actor_id: myId, actor_name: user?.name || 'Admin', actor_role: 'super_admin',
      target_type: r.target_type, target_id: r.target_id,
      details: { ...(r.details||{}), restored_from: r.id },
    };
    const inserted:any = await sbInsert('audit_logs', entry).catch(()=>null);
    if (inserted?.[0]) {
      setRows(prev => prev ? [inserted[0], ...prev] : prev);
    } else {
      alert("Restored successfully, but the restore couldn't be written to the activity log.");
    }
  }

  const actions = useMemo(() => Array.from(new Set((rows||[]).map(r=>r.action).filter(Boolean))), [rows]);
  const [person, setPerson]     = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const people = useMemo(() => Array.from(new Set((rows||[]).map(r=>r.actor_name).filter(Boolean))).sort(), [rows]);
  const shown = useMemo(() => {
    let list = rows || [];
    if (filter !== 'all') list = list.filter(r => r.action === filter);
    if (person !== 'all') list = list.filter(r => r.actor_name === person);
    if (dateFrom) list = list.filter(r => (r.created_at||'') >= dateFrom);
    if (dateTo)   list = list.filter(r => (r.created_at||'').slice(0,10) <= dateTo);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(r =>
      (r.actor_name||'').toLowerCase().includes(q) ||
      (r.action||'').toLowerCase().includes(q) ||
      JSON.stringify(r.details||{}).toLowerCase().includes(q) ||
      (r.target_type||'').toLowerCase().includes(q));
    return list;
  }, [rows, filter, search, person, dateFrom, dateTo]);

  const detailText = (r:any) => {
    const d = r.details || {};
    const bits:string[] = [];
    if (d.name) bits.push(`"${d.name}"`);
    if (d.content) bits.push(`"${String(d.content).slice(0,80)}${String(d.content).length>80?'…':''}"`);
    if (d.sender_name && d.sender_name !== r.actor_name) bits.push(`by ${d.sender_name}`);
    if (d.context) bits.push(`(${d.context})`);
    if (!bits.length && r.target_type) bits.push(r.target_type);
    return bits.join(' ');
  };

  return (
    <div style={{ overflowY:'auto', flex:1, padding:'16px 20px' }}>
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by person or action…"
          style={{ flex:'1 1 220px', padding:'9px 12px', borderRadius:8, border:`1px solid ${B.border}`,
            background:B.surface, color:B.text, fontSize:13, outline:'none' }}/>
        <select value={filter} onChange={e=>setFilter(e.target.value)}
          style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${B.border}`,
            background:B.surface, color:B.text, fontSize:13 }}>
          <option value="all">All actions</option>
          {actions.map(a => <option key={a} value={a}>{actionMeta(a).label}</option>)}
        </select>
        <select value={person} onChange={e=>setPerson(e.target.value)}
          style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${B.border}`,
            background:B.surface, color:B.text, fontSize:13, maxWidth:180 }}>
          <option value="all">All people</option>
          {people.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} title="From date"
            style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${B.border}`, background:B.surface, color:B.text, fontSize:12, colorScheme:'dark' }}/>
          <span style={{ color:B.muted, fontSize:12 }}>→</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} title="To date"
            style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${B.border}`, background:B.surface, color:B.text, fontSize:12, colorScheme:'dark' }}/>
          {(dateFrom||dateTo||person!=='all') && (
            <button onClick={()=>{ setDateFrom(''); setDateTo(''); setPerson('all'); }}
              style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, padding:'7px 10px', color:B.muted, fontSize:11, fontWeight:700, cursor:'pointer' }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {rows === null && <p style={{ color:B.muted, fontSize:13 }}>Loading activity…</p>}
      {rows !== null && shown.length === 0 && (
        <Card><p style={{ color:B.muted, fontSize:13, margin:0, textAlign:'center' }}>
          {rows.length === 0 ? 'No activity recorded yet. Actions like message deletions, community changes, and account changes will appear here.' : 'Nothing matches your search.'}
        </p></Card>
      )}

      {shown.map((r:any) => {
        const m = actionMeta(r.action);
        const open = openId === r.id;
        const d = r.details || {};
        return (
          <Card key={r.id} style={{ marginBottom:8, padding:'12px 14px' }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:14 }}>{m.icon}</span>
              <span style={{ fontSize:13, fontWeight:700, color:B.text }}><LN>{r.actor_name || 'Unknown'}</LN></span>
              {r.actor_role && <span style={{ fontSize:10, fontWeight:700, color:B.gold, border:`1px solid ${B.gold}44`,
                borderRadius:4, padding:'1px 6px', textTransform:'uppercase', letterSpacing:0.5 }}>{r.actor_role}</span>}
              <span style={{ fontSize:13, color:B.text }}>{m.label.toLowerCase()}</span>
              <span style={{ fontSize:12, color:B.muted }}>{detailText(r)}</span>
              <span style={{ fontSize:11, color:B.muted, marginLeft:'auto' }}>{centralTime(r.created_at)}</span>
              <button onClick={()=>setOpenId(open ? null : r.id)}
                style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:6, padding:'3px 9px',
                  color:B.muted, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                {open ? 'Hide' : 'View'}
              </button>
              {canRestore(r) && (
                <button onClick={()=>restore(r)} disabled={restoring===r.id}
                  style={{ background:`${B.gold}22`, border:`1px solid ${B.gold}55`, borderRadius:6, padding:'3px 9px',
                    color:B.gold, fontSize:11, fontWeight:800, cursor:'pointer', opacity:restoring===r.id?0.5:1 }}>
                  {restoring===r.id ? 'Restoring…' : '♻ Restore'}
                </button>
              )}
              {(restoredIds.has(r.id) || ((r.action==='community_archived'||r.action==='message_deleted') && undoneTargets.has(`${r.target_type}:${r.target_id}`))) && (
                <span style={{ fontSize:11, color:B.success, fontWeight:700 }}>✓ Restored</span>
              )}
            </div>
            {open && (
              <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${B.border}`, fontSize:12, color:B.text, lineHeight:1.7 }}>
                {d.name && <div><span style={{ color:B.muted }}>Name: </span><LN>{d.name}</LN></div>}
                {d.content && <div><span style={{ color:B.muted }}>Content: </span>"{d.content}"</div>}
                {d.sender_name && <div><span style={{ color:B.muted }}>Original sender: </span>{d.sender_name}</div>}
                {d.community_name && <div><span style={{ color:B.muted }}>Community: </span>{d.community_name}</div>}
                {d.file_name && <div><span style={{ color:B.muted }}>Attachment: </span>{d.file_name}</div>}
                {d.context && <div><span style={{ color:B.muted }}>Where: </span>{String(d.context).replace(/_/g,' ')}</div>}
                {r.target_type && <div><span style={{ color:B.muted }}>Type: </span>{String(r.target_type).replace(/_/g,' ')}</div>}
                {!d.name && !d.content && !d.community_name && !d.file_name && !d.context && (
                  <div style={{ color:B.muted }}>No extra details were recorded for this event.</div>
                )}
              </div>
            )}
          </Card>
        );
      })}
      {rows !== null && rows.length >= 300 && (
        <p style={{ color:B.muted, fontSize:11, textAlign:'center' }}>Showing the 300 most recent events.</p>
      )}
    </div>
  );
};

const AdminConversationMonitor = ({ user }:any) => {
  const isMobile = useIsMobile();
  const [convos,      setConvos]      = useState<any[]>([]);
  const [profiles,    setProfiles]    = useState<Record<string,any>>({});
  const [selected,    setSelected]    = useState<any>(null);
  const [messages,    setMessages]    = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [ready,       setReady]       = useState(false);
  const [msgLoading,  setMsgLoading]  = useState(false);
  const [search,      setSearch]      = useState('');

  useEffect(() => { init() }, []);

  async function init() {
    const meRows = await sbGet('user_profiles', `email=eq.${encodeURIComponent(user.email)}&select=id,company_id`);
    const me = meRows?.[0];
    if (!me?.company_id) { setLoading(false); return; }
    const rows = await sbGet('conversations',
      `company_id=eq.${me.company_id}&order=last_message_at.desc.nullslast&select=id,participant_a_id,participant_b_id,last_message,last_message_at`);
    const valid = (rows||[]).filter((c:any) => c.participant_a_id && c.participant_b_id);
    setConvos(valid); setReady(true);
    const ids = new Set<string>();
    for (const c of valid) { ids.add(c.participant_a_id); ids.add(c.participant_b_id); }
    if (ids.size) {
      const pRows = await sbGet('user_profiles', `id=in.(${[...ids].join(',')})&select=id,name,initials,role`);
      const map:Record<string,any> = {};
      for (const p of pRows||[]) map[p.id] = p;
      setProfiles(map);
    }
    setLoading(false);
  }

  async function openConvo(c:any) {
    setSelected(c); setMsgLoading(true);
    const msgs = await sbGet('messages', `conversation_id=eq.${c.id}&order=created_at.asc`);
    setMessages(msgs||[]); setMsgLoading(false);
  }

  const pName = (id:string) => profiles[id]?.name || 'Unknown';
  const pInit = (id:string) => profiles[id]?.initials || '??';
  const pRole = (id:string) => (profiles[id]?.role||'').replace(/_/g,' ');

  // Search: match either participant's name (so "jordan" or "marcus" both find their chat)
  const q = search.trim().toLowerCase();
  const shownConvos = q
    ? convos.filter((c:any) =>
        pName(c.participant_a_id).toLowerCase().includes(q) ||
        pName(c.participant_b_id).toLowerCase().includes(q))
    : convos;

  if (loading) return <div style={{ padding:40, textAlign:'center', color:B.muted, fontSize:13 }}>Loading conversations…</div>;

  if (!ready) return (
    <div style={{ padding:'24px 20px' }}>
      <Card>
        <div style={{ textAlign:'center', padding:'24px 0' }}>
          <div style={{ fontSize:32, marginBottom:10 }}>💬</div>
          <p style={{ fontSize:14, fontWeight:700, color:B.muted, margin:'0 0 8px' }}>Conversation monitor not ready</p>
          <p style={{ fontSize:12, color:B.muted, margin:0, lineHeight:1.7 }}>
            Run the SQL setup (companies + conversations participant columns).<br/>
            Once set up, every coach ↔ client thread will appear here for admin review.
          </p>
        </div>
      </Card>
    </div>
  );

  return (
    <div style={{ display:'flex', flex:1, overflow:'hidden', height:'100%' }}>
      {/* Left — conversation list */}
      {(!selected || !isMobile) && (
        <div style={{ width: isMobile?'100%':280, flexShrink:0, borderRight:`1px solid ${B.border}`, overflowY:'auto', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'12px 16px', borderBottom:`1px solid ${B.border}` }}>
            <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:'uppercase', margin:'0 0 8px' }}>
              All Conversations ({shownConvos.length})
            </p>
            <div style={{ position:'relative' }}>
              <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:12, color:B.muted }}>🔍</span>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search by name…"
                style={{ width:'100%', boxSizing:'border-box', background:B.card, border:`1px solid ${B.border}`,
                  borderRadius:8, padding:'8px 28px 8px 30px', color:B.text, fontSize:12, outline:'none' }}/>
              {search && (
                <button onClick={()=>setSearch('')}
                  style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', background:'none',
                    border:'none', color:B.muted, fontSize:13, cursor:'pointer', padding:2, lineHeight:1 }}>×</button>
              )}
            </div>
          </div>
          {shownConvos.length===0 && (
            <div style={{ padding:28, textAlign:'center', color:B.muted, fontSize:12 }}>
              {search ? `No conversations match "${search}"` : 'No conversations yet'}
            </div>
          )}
          {shownConvos.map((c:any) => {
            const isActive = selected?.id===c.id;
            return (
              <button key={c.id} onClick={()=>openConvo(c)}
                style={{ width:'100%', padding:'13px 16px', background:isActive?`${B.gold}15`:'transparent',
                  borderLeft:`3px solid ${isActive?B.gold:'transparent'}`, border:'none',
                  borderBottom:`1px solid ${B.border}`, cursor:'pointer', textAlign:'left' }}>
                <p style={{ fontSize:12, fontWeight:700, color:isActive?B.gold:B.text, margin:'0 0 2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  <LN>{pName(c.participant_a_id)}</LN> ↔ <LN>{pName(c.participant_b_id)}</LN>
                </p>
                <p style={{ fontSize:10, color:B.muted, margin:'0 0 3px', textTransform:'capitalize' }}>
                  {pRole(c.participant_a_id)} · {pRole(c.participant_b_id)}
                </p>
                {c.last_message && <p style={{ fontSize:10, color:B.border, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.last_message}</p>}
              </button>
            );
          })}
        </div>
      )}

      {/* Right — thread view */}
      {selected ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'10px 16px', background:B.surface, borderBottom:`1px solid ${B.border}`, display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            {isMobile && <button onClick={()=>setSelected(null)} style={{ background:'none', border:'none', color:B.gold, fontSize:13, fontWeight:700, cursor:'pointer', padding:0 }}>← Back</button>}
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontSize:13, fontWeight:700, color:B.text, margin:0 }}><LN>{pName(selected.participant_a_id)}</LN> ↔ <LN>{pName(selected.participant_b_id)}</LN></p>
              <p style={{ fontSize:10, color:B.muted, margin:0 }}>Admin read-only · access monitored</p>
            </div>
            <button onClick={()=>openConvo(selected)} style={{ background:`${B.gold}22`, border:`1px solid ${B.goldMid}`, borderRadius:6, padding:'5px 10px', color:B.gold, fontSize:11, fontWeight:700, cursor:'pointer', flexShrink:0 }}>Refresh</button>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
            {msgLoading && <div style={{ textAlign:'center', padding:24, color:B.muted, fontSize:12 }}>Loading messages…</div>}
            {!msgLoading && messages.length===0 && <div style={{ textAlign:'center', padding:24, color:B.muted, fontSize:12 }}>No messages yet</div>}
            {!msgLoading && messages.map((msg:any, i:number) => (
              <div key={msg.id||i} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                  <div style={{ width:22, height:22, borderRadius:11, background:B.goldDim, border:`1px solid ${B.goldMid}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:B.gold, flexShrink:0 }}>
                    <LN>{pInit(msg.sender_id)}</LN>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:B.muted }}><LN>{pName(msg.sender_id)}</LN></span>
                  {msg.created_at && <span style={{ fontSize:9, color:B.border }}>{new Date(msg.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>}
                </div>
                <div style={{ marginLeft:28, background:B.card, border:`1px solid ${msg.deleted_at ? '#ff444455' : B.border}`, borderRadius:'4px 12px 12px 12px', padding:'9px 13px' }}>
                  {msg.deleted_at && (
                    <p style={{ fontSize:10, fontWeight:700, color:'#ff4444', margin:'0 0 4px' }}>
                      🗑 Deleted by {msg.deleted_by_name || 'unknown'}
                    </p>
                  )}
                  <p style={{ fontSize:13, color:msg.deleted_at ? B.muted : B.text, margin:0, lineHeight:1.55, wordBreak:'break-word', ...(msg.deleted_at ? { fontStyle:'italic' } : {}) }}>{msg.content||'📎 File attachment'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : !isMobile && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>💬</div>
            <p style={{ fontSize:14, color:B.muted }}>Select a conversation to read</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── STAFF CLIENT PANEL ───────────────────────────────────────────────────────
const StaffClientPanel = ({ user }:any) => {
  const isMobile = useIsMobile();
  const [loading,     setLoading]     = useState(true);
  const [myProfile,   setMyProfile]   = useState<any>(null);
  const [clients,     setClients]     = useState<any[]>([]);
  const [permsMap,    setPermsMap]    = useState<Record<string,any>>({});
  const [selected,    setSelected]    = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => { init() }, []);

  async function init() {
    const meRows = await sbGet('user_profiles', `email=eq.${encodeURIComponent(user.email)}&select=*`);
    const me = meRows?.[0];
    if (!me) { setLoading(false); return; }
    setMyProfile(me);
    const access:any[] = await sbGet('client_access', `staff_id=eq.${me.id}&company_id=eq.${me.company_id}&select=*`) || [];
    if (!access.length) { setLoading(false); return; }
    const specific  = access.filter((a:any)=>a.client_id).map((a:any)=>a.client_id);
    const coachIds  = access.filter((a:any)=>a.coach_id).map((a:any)=>a.coach_id);
    const compWide  = access.find((a:any)=>!a.client_id && !a.coach_id);
    let clientRows:any[];
    if (compWide) {
      clientRows = await sbGet('user_profiles', `company_id=eq.${me.company_id}&role=eq.client&order=name.asc`) || [];
    } else {
      const byId    = specific.length ? await sbGet('user_profiles', `id=in.(${specific.join(',')})&order=name.asc`) || [] : [];
      const byCoach = coachIds.length ? await sbGet('user_profiles', `coach_id=in.(${coachIds.join(',')})&role=eq.client&order=name.asc`) || [] : [];
      const seen = new Set<string>();
      clientRows = [...byId, ...byCoach].filter((c:any)=>{ if(seen.has(c.id)) return false; seen.add(c.id); return true; });
    }
    const pm:Record<string,any> = {};
    for (const c of clientRows) {
      const sp = access.find((a:any)=>a.client_id===c.id);
      const co = access.find((a:any)=>a.coach_id && a.coach_id===c.coach_id);
      const cw = access.find((a:any)=>!a.client_id && !a.coach_id);
      pm[c.id] = {...(cw?.permissions||{}), ...(co?.permissions||{}), ...(sp?.permissions||{})};
    }
    setClients(clientRows); setPermsMap(pm); setLoading(false);
  }

  async function selectClient(client:any) {
    const perms = permsMap[client.id]||{};
    setSelected({client,perms,data:{}}); setDataLoading(true);
    const data:Record<string,any> = {};
    await Promise.all([
      perms.diet     && sbGet('diet_plans',      `client_id=eq.${client.id}&order=updated_at.desc&limit=1`).then(r=>{data.diet=r?.[0]||null}),
      perms.workout  && sbGet('workout_plans',   `client_id=eq.${client.id}&order=created_at.desc&limit=1`).then(r=>{data.workout=r?.[0]||null}),
      perms.labs     && sbGet('lab_results',     `client_id=eq.${client.id}&order=created_at.desc&limit=6`).then(r=>{data.labs=r||[]}),
      perms.checkins && sbGet('weekly_checkins', `client_id=eq.${client.id}&order=submitted_at.desc&limit=3`).then(r=>{data.checkins=r||[]}),
      perms.coach_convo && (async()=>{
        const coach = client.coach_id ? (await sbGet('user_profiles', `id=eq.${client.coach_id}&select=id,name,full_name`))?.[0] : null;
        if (!coach) { data.coachConvo = { coachName:null, msgs:[] }; return; }
        const [pA,pB] = [coach.id, client.id].sort();
        let conv = (await sbGet('conversations', `participant_a_id=eq.${pA}&participant_b_id=eq.${pB}&limit=1`))?.[0];
        if (!conv) conv = (await sbGet('conversations', `coach_id=eq.${coach.id}&client_id=eq.${client.id}&limit=1`))?.[0];
        const msgs = conv ? await sbGet('messages', `conversation_id=eq.${conv.id}&order=created_at.asc`) : [];
        data.coachConvo = { coachName: coach.name||coach.full_name||'Coach', coachId:coach.id, msgs: msgs||[] };
      })(),
    ].filter(Boolean));
    setSelected({client,perms,data}); setDataLoading(false);
  }

  if (loading) return <div style={{ padding:40, textAlign:'center', color:B.muted, fontSize:13 }}>Loading your clients…</div>;

  if (!myProfile) return (
    <Screen><div style={{ padding:'40px 20px', textAlign:'center' }}>
      <div style={{ fontSize:36, marginBottom:12 }}>👤</div>
      <p style={{ fontSize:14, fontWeight:700, color:B.muted, margin:'0 0 8px' }}>Profile not set up yet</p>
      <p style={{ fontSize:12, color:B.muted, margin:0, lineHeight:1.7 }}>Ask your admin to create your account in Supabase with user_profiles. Your assigned clients will appear here.</p>
    </div></Screen>
  );

  if (!clients.length) return (
    <Screen><div style={{ padding:'40px 20px', textAlign:'center' }}>
      <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
      <p style={{ fontSize:14, fontWeight:700, color:B.muted, margin:'0 0 8px' }}>No clients assigned yet</p>
      <p style={{ fontSize:12, color:B.muted, margin:0 }}>Your admin will assign you to clients via Staff Access. Check back soon.</p>
    </div></Screen>
  );

  return (
    <div style={{ display:'flex', flex:1, overflow:'hidden', height:'100%' }}>
      {/* Client list */}
      {(!selected||!isMobile) && (
        <div style={{ width:isMobile?'100%':230, flexShrink:0, borderRight:`1px solid ${B.border}`, overflowY:'auto' }}>
          <div style={{ padding:'12px 16px', borderBottom:`1px solid ${B.border}` }}>
            <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:'uppercase', margin:0 }}>My Clients ({clients.length})</p>
          </div>
          {clients.map((c:any)=>{
            const perms = permsMap[c.id]||{};
            const active = PERM_DEFS.filter((p:any)=>perms[p.key]);
            const isAct  = selected?.client?.id===c.id;
            return (
              <button key={c.id} onClick={()=>selectClient(c)}
                style={{ width:'100%', padding:'12px 14px', background:isAct?`${B.gold}15`:'transparent', borderLeft:`3px solid ${isAct?B.gold:'transparent'}`, border:'none', borderBottom:`1px solid ${B.border}`, cursor:'pointer', textAlign:'left' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:34, height:34, borderRadius:17, background:isAct?B.gold:B.card, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:isAct?B.black:B.muted, flexShrink:0 }}>
                    <LN>{(c.initials||c.name[0]).slice(0,2)}</LN>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight:700, color:isAct?B.gold:B.text, margin:'0 0 4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}><LN>{c.name}</LN></p>
                    <div style={{ display:'flex', gap:3 }}>{active.map((p:any)=><span key={p.key} style={{ fontSize:10 }}>{p.icon}</span>)}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail panel */}
      {selected ? (
        <div style={{ flex:1, overflowY:'auto' }}>
          <div style={{ padding:'12px 16px', background:B.surface, borderBottom:`1px solid ${B.border}`, display:'flex', alignItems:'center', gap:10, position:'sticky', top:0, zIndex:10 }}>
            {isMobile && <button onClick={()=>setSelected(null)} style={{ background:'none', border:'none', color:B.gold, fontSize:13, fontWeight:700, cursor:'pointer', padding:0 }}>← Back</button>}
            <div>
              <p style={{ fontSize:14, fontWeight:800, color:B.text, margin:0 }}>{selected.client.name}</p>
              <p style={{ fontSize:10, color:B.muted, margin:0 }}>Read-only · permissions granted by admin</p>
            </div>
          </div>
          {dataLoading && <div style={{ padding:32, textAlign:'center', color:B.muted, fontSize:12 }}>Loading data…</div>}
          {!dataLoading && (
            <div style={{ padding:'16px 20px 40px' }}>
              {/* Permission chips */}
              <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:16 }}>
                {PERM_DEFS.map((p:any)=>{
                  const on=!!selected.perms[p.key];
                  return <span key={p.key} style={{ fontSize:10, fontWeight:700, color:on?p.color:B.border, background:on?`${p.color}15`:B.surface, border:`1px solid ${on?p.color+'44':B.border}`, borderRadius:12, padding:'3px 10px' }}>{p.icon} {p.label}</span>;
                })}
              </div>

              {/* Coach ↔ Client conversation (read-only, separate allowance) */}
              {selected.perms.coach_convo && (
                <Card style={{ marginBottom:12 }}>
                  <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:'uppercase', margin:'0 0 8px' }}>👁 Coach ↔ Client Conversation <span style={{ color:'#e8b76f' }}>· read-only</span></p>
                  {!selected.data.coachConvo?.coachName
                    ? <p style={{ fontSize:12, color:B.muted, margin:0 }}>No coach assigned to this client yet</p>
                    : !selected.data.coachConvo.msgs.length
                      ? <p style={{ fontSize:12, color:B.muted, margin:0 }}>No messages between {selected.data.coachConvo.coachName} and {selected.client.name} yet</p>
                      : (
                        <div style={{ maxHeight:320, overflowY:'auto' }}>
                          {selected.data.coachConvo.msgs.map((m:any)=>{
                            const fromCoach = m.sender_id===selected.data.coachConvo.coachId;
                            return (
                              <div key={m.id} style={{ display:'flex', justifyContent:fromCoach?'flex-start':'flex-end', marginBottom:6 }}>
                                <div style={{ maxWidth:'80%', background:fromCoach?B.surface:`${B.gold}18`, border:`1px solid ${fromCoach?B.border:B.gold+'33'}`, borderRadius:10, padding:'6px 10px' }}>
                                  <p style={{ fontSize:9, fontWeight:700, color:fromCoach?'#6FB8E8':B.gold, margin:'0 0 2px' }}>{fromCoach?selected.data.coachConvo.coachName:selected.client.name}</p>
                                  <p style={{ fontSize:12, color:B.text, margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{m.content}</p>
                                  <p style={{ fontSize:8, color:B.muted, margin:'2px 0 0' }}>{m.created_at?new Date(m.created_at).toLocaleString():''}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                </Card>
              )}

              {/* Diet */}
              {selected.perms.diet && (
                <Card style={{ marginBottom:12 }}>
                  <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:'uppercase', margin:'0 0 8px' }}>🥗 Current Diet Plan</p>
                  {selected.data.diet ? (<>
                    <p style={{ fontSize:13, fontWeight:700, color:B.gold, margin:'0 0 4px' }}>{selected.data.diet.protocol||'Protocol on file'}</p>
                    <p style={{ fontSize:11, color:B.muted, margin:'0 0 4px' }}>Updated: {selected.data.diet.updated_at?new Date(selected.data.diet.updated_at).toLocaleDateString():'—'}</p>
                    {(()=>{try{const t=typeof selected.data.diet.targets==='string'?JSON.parse(selected.data.diet.targets):selected.data.diet.targets;
                      return t?<p style={{ fontSize:11, color:B.muted, margin:0 }}>Targets · {t.calories} kcal · P:{t.protein}g · C:{t.carbs}g · F:{t.fat}g</p>:null;}catch{return null;}})()}
                  </>) : <p style={{ fontSize:12, color:B.muted, margin:0 }}>No saved plan yet — coach must save from Diet Builder</p>}
                </Card>
              )}

              {/* Workout */}
              {selected.perms.workout && (
                <Card style={{ marginBottom:12 }}>
                  <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:'uppercase', margin:'0 0 8px' }}>🏋️ Workout Plan</p>
                  {selected.data.workout
                    ? <><p style={{ fontSize:13, fontWeight:700, color:B.gold, margin:'0 0 4px' }}>Plan on file</p>
                       <p style={{ fontSize:11, color:B.muted, margin:0 }}>Saved: {selected.data.workout.created_at?new Date(selected.data.workout.created_at).toLocaleDateString():'—'}</p></>
                    : <p style={{ fontSize:12, color:B.muted, margin:0 }}>No workout plan saved yet</p>}
                </Card>
              )}

              {/* Labs */}
              {selected.perms.labs && (
                <Card style={{ marginBottom:12 }}>
                  <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:'uppercase', margin:'0 0 8px' }}>🔬 Lab Results</p>
                  {selected.data.labs?.length
                    ? selected.data.labs.map((lab:any,i:number)=>(
                        <div key={i} style={{ padding:'6px 0', borderTop:i>0?`1px solid ${B.border}`:'none' }}>
                          <p style={{ fontSize:12, color:B.text, margin:'0 0 2px' }}>{lab.test_name||lab.marker_name||'Lab result'}</p>
                          <p style={{ fontSize:10, color:B.muted, margin:0 }}>{lab.value} {lab.unit} · {lab.created_at?new Date(lab.created_at).toLocaleDateString():''}</p>
                        </div>
                      ))
                    : <p style={{ fontSize:12, color:B.muted, margin:0 }}>No lab results on file</p>}
                </Card>
              )}

              {/* Check-ins */}
              {selected.perms.checkins && (
                <Card style={{ marginBottom:12 }}>
                  <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:'uppercase', margin:'0 0 8px' }}>✅ Recent Check-ins</p>
                  {selected.data.checkins?.length
                    ? selected.data.checkins.map((ci:any,i:number)=>(
                        <div key={i} style={{ padding:'6px 0', borderTop:i>0?`1px solid ${B.border}`:'none' }}>
                          <p style={{ fontSize:12, color:B.text, margin:'0 0 2px' }}>{ci.submitted_at?new Date(ci.submitted_at).toLocaleDateString():'Check-in'}</p>
                          <p style={{ fontSize:10, color:B.muted, margin:0 }}>Weight: {ci.weight_lbs||'—'} lbs · Energy: {ci.energy_level||'—'}/10 · Sleep: {ci.sleep_quality||'—'}/10</p>
                        </div>
                      ))
                    : <p style={{ fontSize:12, color:B.muted, margin:0 }}>No check-ins on file</p>}
                </Card>
              )}

              {/* Habits note */}
              {selected.perms.habits && (
                <Card style={{ marginBottom:12 }}>
                  <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:'uppercase', margin:'0 0 6px' }}>🌱 Habits</p>
                  <p style={{ fontSize:12, color:B.muted, margin:0 }}>Company-wide habit protocols are in the Habits tab. Client-specific tracking will show here once per-client habit logs are saved.</p>
                </Card>
              )}
            </div>
          )}
        </div>
      ) : !isMobile && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>👤</div>
            <p style={{ fontSize:14, color:B.muted }}>Select a client to view their data</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── ORG BRANDING EDITOR (Eden HQ → Manage an org) ──────────────────────────
// Lets the super admin edit any organization's name, brand colors, and logo.
// Uses the same validation + PATCH-and-verify approach as the white-label
// admin's own branding panel.
const OrgBrandingEditor = ({ org, onSaved, onClose }:any) => {
  const [nameDraft, setNameDraft] = useState(org.name || '');
  const [colorDraft, setColorDraft] = useState(org.brand_color || '#ffa600');
  const [paletteDraft, setPaletteDraft] = useState<string[]>(
    Array.isArray(org.brand_colors) ? org.brand_colors.filter((c:any)=>typeof c==='string') : []);
  const [logoDraft, setLogoDraft] = useState(org.logo_url || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState('');
  const logoFileRef = useRef<HTMLInputElement>(null);

  const isHex6 = (v:string) => /^#[0-9a-fA-F]{6}$/.test((v||'').trim());
  const isDataUrl = (logoDraft || '').startsWith('data:');
  const accent = isHex6(colorDraft) ? colorDraft.trim() : (org.brand_color || B.gold);

  // Preview object for OrgLogo
  const previewOrg = { ...org, name:nameDraft, brand_color:accent, logo_url:logoDraft || null };

  const save = async () => {
    const name = (nameDraft || '').trim();
    if (!name) { setError('Organization name cannot be empty.'); return; }
    const primary = (colorDraft || '').trim();
    if (!isHex6(primary)) { setError('Primary color must be a 6-digit hex value like #ffa600.'); return; }
    const extras = paletteDraft.map(c => (c||'').trim()).filter(Boolean);
    if (extras.some(c => !isHex6(c))) { setError('Palette colors must be 6-digit hex values like #6FB8E8.'); return; }
    const logo = (logoDraft || '').trim();
    if (logo && !/^(https?:\/\/|data:image\/)/i.test(logo)) {
      setError('Logo must be a valid image URL (https://…) or an uploaded file.'); return;
    }
    setError(''); setSaving(true);
    const body = { name, brand_color: primary, brand_colors: extras.length ? extras : null, logo_url: logo || null };
    await sbPatch('organizations', `id=eq.${org.id}`, body);
    // Verify the write landed (sbPatch swallows errors)
    const check = await sbGet('organizations', `id=eq.${org.id}&select=name,brand_color,brand_colors,logo_url&limit=1`);
    const row = check?.[0];
    if (row && row.name === name && (row.brand_color||'').toLowerCase() === primary.toLowerCase() && (row.logo_url||'') === (logo||'')) {
      onSaved({ ...org, ...body });
      window.dispatchEvent(new Event('eden:branding-updated'));
      setSaved(true); setTimeout(()=>setSaved(false), 2000);
    } else {
      setError('Could not save changes. Please try again.');
    }
    setSaving(false);
  };

  const onLogoFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setLogoError('Please choose an image file.'); return; }
    if (file.size > 2 * 1024 * 1024) { setLogoError('Image too large — please use a file under 2 MB.'); return; }
    setLogoError('');
    // Preferred: real file storage
    const url = await sbUploadLogo(org.id, file);
    if (url) { setLogoDraft(url); return; }
    // Fallback if the storage bucket isn't set up yet: store small images inline
    if (file.size > 400 * 1024) {
      setLogoError('File storage isn\u2019t set up yet — use a file under 400 KB, or paste a hosted image URL.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDraft(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const inputStyle:any = { background:B.dim, border:`1px solid ${B.border}`, borderRadius:8, padding:"8px 10px", color:B.text, fontSize:12, outline:"none", boxSizing:"border-box", fontFamily:"inherit" };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:B.surface, border:`1px solid ${B.border}`, borderRadius:16, width:"100%", maxWidth:520, maxHeight:"90vh", overflowY:"auto", padding:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <p style={{ fontSize:13, fontWeight:800, color:accent, letterSpacing:1, textTransform:"uppercase", margin:0 }}>⚙️ Manage <LN>{org.name}</LN></p>
          <button onClick={onClose} style={{ background:"none", border:"none", color:B.muted, fontSize:18, cursor:"pointer", padding:0, lineHeight:1 }}>✕</button>
        </div>

        {/* Name */}
        <label style={{ display:"block", fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:6 }}>Organization Name</label>
        <input type="text" value={nameDraft} onChange={e=>{ setNameDraft(e.target.value); setError(''); }}
          style={{ ...inputStyle, width:"100%", marginBottom:16 }}/>

        {/* Logo */}
        <label style={{ display:"block", fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:6 }}>Logo</label>
        <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap", marginBottom:16 }}>
          <OrgLogo org={previewOrg} size={52}/>
          <div style={{ flex:1, minWidth:200 }}>
            <input type="text" value={isDataUrl ? '(uploaded image)' : logoDraft} readOnly={isDataUrl}
              onChange={e=>{ setLogoDraft(e.target.value); setLogoError(''); setError(''); }}
              placeholder="https://yourdomain.com/logo.png"
              style={{ ...inputStyle, width:"100%", marginBottom:8 }}/>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <button onClick={()=>logoFileRef.current?.click()}
                style={{ background:B.card, color:B.text, border:`1px solid ${B.border}`, borderRadius:8, padding:"7px 12px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                Upload Image…
              </button>
              {logoDraft && (
                <button onClick={()=>{ setLogoDraft(''); setLogoError(''); }}
                  style={{ background:"none", color:B.danger, border:`1px solid ${B.danger}44`, borderRadius:8, padding:"7px 12px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  Remove
                </button>
              )}
            </div>
            <input ref={logoFileRef} type="file" accept="image/*" style={{ display:"none" }}
              onChange={e=>{ onLogoFile(e.target.files?.[0] || null); e.target.value=''; }}/>
            {logoError && <p style={{ fontSize:11, color:B.danger, margin:"8px 0 0" }}>{logoError}</p>}
          </div>
        </div>

        {/* Primary color */}
        <label style={{ display:"block", fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:6 }}>Brand Colors</label>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:10 }}>
          <span style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", width:70, flexShrink:0 }}>Primary</span>
          <input type="color" value={isHex6(colorDraft) ? colorDraft.trim() : '#ffa600'}
            onChange={e=>{ setColorDraft(e.target.value); setError(''); }}
            style={{ width:40, height:34, padding:2, background:B.dim, border:`1px solid ${B.border}`, borderRadius:8, cursor:"pointer" }}/>
          <input type="text" value={colorDraft} onChange={e=>{ setColorDraft(e.target.value); setError(''); }}
            placeholder="#ffa600" maxLength={7}
            style={{ ...inputStyle, width:100, fontFamily:"monospace" }}/>
          <span style={{ fontSize:11, fontWeight:800, color:"#000", background:accent, borderRadius:8, padding:"8px 12px" }}>Preview</span>
        </div>
        {paletteDraft.map((c, i) => (
          <div key={i} style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:10 }}>
            <span style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", width:70, flexShrink:0 }}>Color {i+2}</span>
            <input type="color" value={isHex6(c) ? c.trim() : '#888888'}
              onChange={e=>{ setPaletteDraft(p => p.map((v,j)=> j===i ? e.target.value : v)); setError(''); }}
              style={{ width:40, height:34, padding:2, background:B.dim, border:`1px solid ${B.border}`, borderRadius:8, cursor:"pointer" }}/>
            <input type="text" value={c}
              onChange={e=>{ setPaletteDraft(p => p.map((v,j)=> j===i ? e.target.value : v)); setError(''); }}
              placeholder="#6FB8E8" maxLength={7}
              style={{ ...inputStyle, width:100, fontFamily:"monospace" }}/>
            <button onClick={()=>{ setPaletteDraft(p => p.filter((_,j)=>j!==i)); setError(''); }}
              style={{ background:"none", color:B.danger, border:`1px solid ${B.danger}44`, borderRadius:8, padding:"7px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
              Remove
            </button>
          </div>
        ))}
        {paletteDraft.length < 5 && (
          <button onClick={()=>setPaletteDraft(p => [...p, '#6FB8E8'])}
            style={{ background:B.card, color:B.text, border:`1px solid ${B.border}`, borderRadius:8, padding:"7px 12px", fontSize:12, fontWeight:700, cursor:"pointer", marginBottom:12 }}>
            + Add Palette Color
          </button>
        )}

        {error && <p style={{ fontSize:11, color:B.danger, margin:"4px 0 8px" }}>{error}</p>}
        <div style={{ display:"flex", gap:8, marginTop:8 }}>
          <button onClick={save} disabled={saving}
            style={{ background:saved?B.success:accent, color:"#000", border:"none", borderRadius:8, padding:"9px 16px", fontSize:12, fontWeight:800, cursor:saving?"wait":"pointer", opacity:saving?0.6:1 }}>
            {saved ? "✓ Saved" : saving ? "Saving…" : "Save Changes"}
          </button>
          <button onClick={onClose}
            style={{ background:B.card, color:B.text, border:`1px solid ${B.border}`, borderRadius:8, padding:"9px 16px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────
// Fallback prices if the packages table hasn't been set up yet — the live
// tiers/prices are managed in Admin → Orgs → Packages & Pricing
const FALLBACK_PLAN_PRICES:Record<string,number> = { standard:299, professional:499, enterprise:999 };
const EDEN_COMPANY_ID = 'b0000000-0000-0000-0000-000000000001';

const AdminDashboard = ({ user }:any) => {
  const isMobile = useIsMobile();
  const [adminTab, setAdminTab] = useState('overview');
  const [dbOrgs,   setDbOrgs]   = useState<any[]|null>(null);
  const [counts,   setCounts]   = useState<{coaches:number,clients:number}|null>(null);
  // Platform owner (Eden HQ) sees Organizations + MRR; white-label admins see only their own coach/client counts
  const [isOwnerHQ, setIsOwnerHQ] = useState(true);
  const [myCompanyId, setMyCompanyId] = useState<string|null>(null);
  const [planPrices, setPlanPrices] = useState<Record<string,number>>(FALLBACK_PLAN_PRICES);
  const [myOrg, setMyOrg] = useState<any>(null);        // white-label admin's own org (for branded login link)
  const [myProfileId, setMyProfileId] = useState('');   // caller's profile id (webhook config auth)
  const [manageOrg, setManageOrg] = useState<any>(null); // Eden HQ: org being edited via "Manage →"
  const [linkCopied, setLinkCopied] = useState(false);
  // Upcoming contract starts (org-wide, admin view)
  const [upcomingClients, setUpcomingClients] = useState<any[]>([]);
  useEffect(() => { (async () => {
    try {
      const me = await sbGet('user_profiles', `email=eq.${encodeURIComponent(user.email)}&select=company_id`);
      const cid = me?.[0]?.company_id;
      if (!cid) return;
      const t = new Date();
      const iso = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
      const rows = (await sbGet('user_profiles',
        `company_id=eq.${cid}&role=eq.client&is_active=not.is.false&start_date=gt.${iso}&select=id,name,email,update_day,start_date&order=start_date.asc`)) || [];
      setUpcomingClients(rows.map((r:any) => ({
        uuid: r.id, name: r.name, email: r.email, checkInDay: r.update_day || '', startDate: r.start_date,
      })));
    } catch (e) {}
  })(); }, [user?.email]);
  // Logo management (white-label admins)
  const [logoDraft, setLogoDraft] = useState('');
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoSaved, setLogoSaved] = useState(false);
  const [logoError, setLogoError] = useState('');
  const logoFileRef = useRef<HTMLInputElement>(null);
  // Brand color management (white-label admins)
  const [colorDraft, setColorDraft] = useState('#ffa600');       // primary brand color
  const [paletteDraft, setPaletteDraft] = useState<string[]>([]); // optional extra palette colors
  const [colorSaving, setColorSaving] = useState(false);
  const [colorSaved, setColorSaved] = useState(false);
  const [colorError, setColorError] = useState('');

  const isHex6 = (v:string) => /^#[0-9a-fA-F]{6}$/.test((v||'').trim());

  const saveColors = async () => {
    if (!myOrg) return;
    const primary = (colorDraft || '').trim();
    if (!isHex6(primary)) { setColorError('Primary color must be a 6-digit hex value like #ffa600.'); return; }
    const extras = paletteDraft.map(c => (c||'').trim()).filter(Boolean);
    if (extras.some(c => !isHex6(c))) { setColorError('Palette colors must be 6-digit hex values like #6FB8E8.'); return; }
    setColorError(''); setColorSaving(true);
    await sbPatch('organizations', `id=eq.${myOrg.id}`, { brand_color: primary, brand_colors: extras.length ? extras : null });
    // Verify the write landed (sbPatch swallows errors)
    const check = await sbGet('organizations', `id=eq.${myOrg.id}&select=brand_color,brand_colors&limit=1`);
    const savedPrimary = check?.[0]?.brand_color ?? null;
    if ((savedPrimary || '').toLowerCase() === primary.toLowerCase()) {
      setMyOrg((o:any) => ({ ...o, brand_color: primary, brand_colors: extras.length ? extras : null }));
      window.dispatchEvent(new Event('eden:branding-updated'));
      setColorSaved(true); setTimeout(()=>setColorSaved(false), 2000);
    } else {
      setColorError('Could not save your colors. Please try again.');
    }
    setColorSaving(false);
  };

  const saveLogo = async (url: string) => {
    if (!myOrg) return;
    const trimmed = (url || '').trim();
    if (trimmed && !/^(https?:\/\/|data:image\/)/i.test(trimmed)) {
      setLogoError('Enter a valid image URL (https://…) or upload a file.');
      return;
    }
    setLogoError(''); setLogoSaving(true);
    await sbPatch('organizations', `id=eq.${myOrg.id}`, { logo_url: trimmed || null });
    // Verify the write landed (sbPatch swallows errors)
    const check = await sbGet('organizations', `id=eq.${myOrg.id}&select=logo_url&limit=1`);
    const saved = check?.[0]?.logo_url ?? null;
    if ((saved || '') === (trimmed || '')) {
      setMyOrg((o:any) => ({ ...o, logo_url: trimmed || null }));
      window.dispatchEvent(new Event('eden:branding-updated'));
      setLogoDraft(trimmed);
      setLogoSaved(true); setTimeout(()=>setLogoSaved(false), 2000);
    } else {
      setLogoError('Could not save the logo. Please try again.');
    }
    setLogoSaving(false);
  };

  const onLogoFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setLogoError('Please choose an image file.'); return; }
    if (file.size > 2 * 1024 * 1024) { setLogoError('Image too large — please use a file under 2 MB.'); return; }
    setLogoError(''); setLogoSaving(true);
    // Preferred: real file storage (keeps the database lean and logos fast to load)
    const url = myOrg ? await sbUploadLogo(myOrg.id, file) : null;
    if (url) { await saveLogo(url); return; }
    // Fallback if the storage bucket isn't set up yet: store small images inline as before
    if (file.size > 400 * 1024) {
      setLogoSaving(false);
      setLogoError('File storage isn\u2019t set up yet — use a file under 400 KB, or paste a hosted image URL.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => saveLogo(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  useEffect(() => { (async () => {
    try {
      const meRows = await sbGet('user_profiles', `email=eq.${encodeURIComponent(user.email)}&select=id,company_id`);
      const cid = meRows?.[0]?.company_id || null;
      if (meRows?.[0]?.id) setMyProfileId(meRows[0].id);
      setMyCompanyId(cid);
      const ownerHQ = !cid || cid === EDEN_COMPANY_ID;
      setIsOwnerHQ(ownerHQ);
      if (!ownerHQ) {
        const orgRows = await sbGet('organizations', `id=eq.${cid}&select=id,name,slug,brand_color,brand_colors,logo_url,is_white_label&limit=1`);
        if (orgRows?.[0]?.is_white_label && orgRows[0].slug) {
          setMyOrg(orgRows[0]);
          setLogoDraft(orgRows[0].logo_url || '');
          if (orgRows[0].brand_color) setColorDraft(orgRows[0].brand_color);
          if (Array.isArray(orgRows[0].brand_colors)) setPaletteDraft(orgRows[0].brand_colors.filter((c:any)=>typeof c==='string'));
        }
      }
      // Coach & client counts — company-scoped for white-label admins, platform-wide for Eden HQ
      const scope = ownerHQ ? '' : `&company_id=eq.${cid}`;
      const [coachRows, clientRows] = await Promise.all([
        sbGet('user_profiles', `role=in.(coach,head_coach)${scope}&select=id`),
        sbGet('user_profiles', `role=eq.client${scope}&select=id`),
      ]);
      if (Array.isArray(coachRows) && Array.isArray(clientRows))
        setCounts({ coaches: coachRows.length, clients: clientRows.length });
      if (ownerHQ) {
        const [orgRows, pkgRows] = await Promise.all([
          sbGet('organizations', `select=id,name,slug,plan,is_white_label,brand_color,brand_colors,logo_url,is_active&order=created_at.asc`),
          sbGet('packages', `active=eq.true&select=name,price`).catch(()=>null),
        ]);
        if (Array.isArray(orgRows)) setDbOrgs(orgRows);
        if (Array.isArray(pkgRows) && pkgRows.length) {
          const map:Record<string,number> = {};
          pkgRows.forEach((p:any)=>{ map[(p.name||'').toLowerCase()] = Number(p.price)||0 });
          setPlanPrices(map);
        }
      }
    } catch {}
  })() }, []);

  // Per-coach check-in deadline settings (admin can adjust each coach's from Overview)
  const [coachDl, setCoachDl] = useState<Record<string,any>>({});
  const [dlCoaches, setDlCoaches] = useState<any[]>([]);
  const [welcomeAdmins, setWelcomeAdmins] = useState<any[]>([]);
  const [formScope, setFormScope] = useState('');   // '' closed · 'org' · coach id
  // Video huddles (Daily.co) — per-org connection status
  const [huddleStatus, setHuddleStatus] = useState<any>(null); // { connected, source }
  const [dailyKeyInput, setDailyKeyInput] = useState('');
  const [dailySaving, setDailySaving] = useState(false);
  const [dailyMsg, setDailyMsg] = useState('');
  const loadHuddleStatus = async () => {
    try {
      const r = await fetch('/api/huddle/status', { headers: { Authorization: sbBearer() } });
      setHuddleStatus(r.ok ? await r.json() : { connected:false, source:'none' });
    } catch { setHuddleStatus({ connected:false, source:'none' }); }
  };
  useEffect(() => { loadHuddleStatus(); }, []);
  const saveDailyKey = async () => {
    setDailySaving(true); setDailyMsg('');
    try {
      const r = await fetch('/api/huddle/daily-key', {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization: sbBearer() },
        body: JSON.stringify({ key: dailyKeyInput }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { setDailyMsg('✅ Connected! Coaches can now start video huddles.'); setDailyKeyInput(''); loadHuddleStatus(); }
      else setDailyMsg(`⚠️ ${d?.error || 'Could not save the key'}`);
    } catch { setDailyMsg('⚠️ Could not save the key'); }
    setDailySaving(false);
  };
  // GHL intake webhook — white-label admins can grab their own URL + secret
  const [ghlCfg, setGhlCfg] = useState<any>(null);      // null loading · false error · {url, secret}
  const [ghlCopied, setGhlCopied] = useState('');
  useEffect(() => {
    if (!myOrg?.id) return;
    fetch(`/api/webhooks/ghl-intake/${myOrg.id}/config`, { headers: { Authorization: sbBearer() } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setGhlCfg(d && d.url ? d : false))
      .catch(() => setGhlCfg(false));
  }, [myOrg?.id]);
  const ghlCopy = async (what: string, val: string) => {
    try { await navigator.clipboard.writeText(val); setGhlCopied(what); setTimeout(() => setGhlCopied(''), 2000); } catch {}
  };
  // Automated welcome messages (admin-configurable, per org + per coach)
  const [welcomeCfg, setWelcomeCfg] = useState<any>(null); // null = loading
  const [welcomeSaving, setWelcomeSaving] = useState(false);
  const [welcomeMsgStatus, setWelcomeMsgStatus] = useState('');
  const [welcomeCoachOpen, setWelcomeCoachOpen] = useState('');
  useEffect(() => { (async () => {
    try {
      const r = await fetch('/api/welcome/settings', { headers: { Authorization: sbBearer() } });
      const d = await r.json().catch(() => null);
      setWelcomeCfg(d?.settings || { enabled:false, defaultText:'', perCoach:{} });
    } catch { setWelcomeCfg({ enabled:false, defaultText:'', perCoach:{} }); }
  })(); }, []);
  const saveWelcomeCfg = async (cfg:any) => {
    setWelcomeSaving(true); setWelcomeMsgStatus('');
    try {
      const r = await fetch('/api/welcome/settings', {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization: sbBearer() },
        body: JSON.stringify(cfg),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { setWelcomeCfg(d?.settings || cfg); setWelcomeMsgStatus('✅ Saved'); }
      else setWelcomeMsgStatus(`⚠️ ${d?.error || 'Could not save'}`);
    } catch { setWelcomeMsgStatus('⚠️ Could not save'); }
    setWelcomeSaving(false);
    setTimeout(() => setWelcomeMsgStatus(''), 3000);
  };
  const removeDailyKey = async () => {
    if (!window.confirm('Disconnect Daily.co? Coaches will no longer be able to start video huddles.')) return;
    try {
      await fetch('/api/huddle/daily-key/remove', { method:'POST', headers:{ Authorization: sbBearer() } });
      setDailyMsg(''); loadHuddleStatus();
    } catch {}
  };
  // Meta ads recaps — per-org connection + destination community + cadences
  const [metaAds, setMetaAds] = useState<any>(null);       // null loading · {connected,...}
  const [metaToken, setMetaToken] = useState('');
  const [metaAcct, setMetaAcct] = useState('');
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaMsg, setMetaMsg] = useState('');
  const [metaCommunities, setMetaCommunities] = useState<any[]>([]);
  const loadMetaAds = async () => {
    try {
      const r = await fetch('/api/meta-ads/status', { headers: { Authorization: sbBearer() } });
      const d = await r.json().catch(() => null);
      setMetaAds(r.ok && d?.ok ? d : { connected:false });
    } catch { setMetaAds({ connected:false }); }
  };
  useEffect(() => { loadMetaAds(); }, []);
  useEffect(() => {
    const cid = isOwnerHQ ? EDEN_COMPANY_ID : (myOrg?.id || EDEN_COMPANY_ID);
    sbGet('communities', `company_id=eq.${cid}&is_active=eq.true&select=id,name,context&order=name`)
      .then((rows:any[]) => setMetaCommunities(Array.isArray(rows) ? rows : []))
      .catch(() => setMetaCommunities([]));
  }, [myOrg?.id]);
  const metaConnect = async () => {
    setMetaBusy(true); setMetaMsg('');
    try {
      const r = await fetch('/api/meta-ads/connect', {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization: sbBearer() },
        body: JSON.stringify({ token: metaToken, adAccountId: metaAcct }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { setMetaMsg(`✅ Connected to ${d?.account_name || 'your ad account'}! Now pick a community below.`); setMetaToken(''); setMetaAcct(''); loadMetaAds(); }
      else setMetaMsg(`⚠️ ${d?.error || 'Could not connect'}`);
    } catch { setMetaMsg('⚠️ Could not connect'); }
    setMetaBusy(false);
  };
  const metaDisconnect = async () => {
    if (!window.confirm('Disconnect Meta Ads? Recaps will stop posting.')) return;
    try {
      await fetch('/api/meta-ads/disconnect', { method:'POST', headers:{ Authorization: sbBearer() } });
      setMetaMsg(''); loadMetaAds();
    } catch {}
  };
  const metaSaveSettings = async (patch:any) => {
    setMetaBusy(true); setMetaMsg('');
    try {
      const r = await fetch('/api/meta-ads/settings', {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization: sbBearer() },
        body: JSON.stringify(patch),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { setMetaMsg('✅ Saved'); loadMetaAds(); }
      else setMetaMsg(`⚠️ ${d?.error || 'Could not save'}`);
    } catch { setMetaMsg('⚠️ Could not save'); }
    setMetaBusy(false);
    setTimeout(() => setMetaMsg(m => m === '✅ Saved' ? '' : m), 3000);
  };
  const metaRunNow = async (period:string) => {
    setMetaBusy(true); setMetaMsg('');
    try {
      const r = await fetch('/api/meta-ads/run-now', {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization: sbBearer() },
        body: JSON.stringify({ period }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) setMetaMsg('✅ Recap posted! Check the community.');
      else setMetaMsg(`⚠️ ${d?.error || 'Could not post the recap'}`);
    } catch { setMetaMsg('⚠️ Could not post the recap'); }
    setMetaBusy(false);
  };
  useEffect(() => {
    sbGet('user_profiles', `role=in.(coach,head_coach)&is_active=not.is.false&select=id,name,timezone,deadline_time&order=name`)
      .then((rows:any[]) => {
        if (!Array.isArray(rows)) return;
        setDlCoaches(rows);
        const map:Record<string,any> = {};
        rows.forEach((r:any) => { map[r.id] = { tz: r.timezone || DEFAULT_TZ, time: r.deadline_time ? r.deadline_time.slice(0,5) : DEFAULT_TIME } });
        setCoachDl(map);
      }).catch(()=>{});
    sbGet('user_profiles', `role=eq.super_admin&is_active=not.is.false&select=id,name&order=name`)
      .then((rows:any[]) => { if (Array.isArray(rows)) setWelcomeAdmins(rows); }).catch(()=>{});
  }, []);
  async function saveCoachDl(id:string, patch:any, local:any) {
    const prev = coachDl[id] || {};
    setCoachDl(m => ({ ...m, [id]: { ...prev, ...local } }));
    const ok = await sbPatch('user_profiles', `id=eq.${id}`, patch);
    if (!ok) { setCoachDl(m => ({ ...m, [id]: prev })); alert("Couldn't save the deadline change — try again."); return; }
    clearTzCache();
  }

  // MRR = sum of package prices across white-label orgs (Eden HQ itself doesn't count)
  const whiteLabelOrgs = (dbOrgs || []).filter((o:any) => o.is_white_label && o.is_active !== false);
  const mrr = whiteLabelOrgs.reduce((sum:number, o:any) => sum + (planPrices[(o.plan||'').toLowerCase()] || 0), 0);
  const fmtMrr = mrr >= 1000 ? `$${(mrr/1000).toFixed(1)}k` : `$${mrr}`;

  // Real orgs only — no demo placeholders (empty until the DB list loads)
  const orgs = (dbOrgs || []).map((o:any) => ({ name:o.name, coaches:'—', clients:'—', color:o.brand_color||B.gold, plan:o.plan, isWhiteLabel:o.is_white_label, row:o }));

  const statCards = isOwnerHQ
    ? [
        {label:"Organizations", val: dbOrgs ? dbOrgs.length : orgs.length},
        {label:"Total Coaches", val: counts ? counts.coaches : 6},
        {label:"Total Clients", val: counts ? counts.clients : 41},
        {label:"MRR (White Label)", val: fmtMrr},
      ]
    : [
        {label:"Total Coaches", val: counts ? counts.coaches : '—'},
        {label:"Total Clients", val: counts ? counts.clients : '—'},
      ];
  return (
    <Screen>
      <div style={{ background:`linear-gradient(180deg,#111100 0%,#000000 100%)`, padding:"28px 20px 16px" }}>
        <p style={{ fontSize:11, color:B.gold, fontWeight:700, letterSpacing:1, margin:"0 0 4px" }}>🛡 SUPER ADMIN</p>
        <h1 style={{ fontSize:22, fontWeight:700, color:B.text, margin:0 }}>Eden Admin Panel</h1>
        <p style={{ fontSize:12, color:B.muted, margin:"4px 0 0" }}>Platform-wide access · edencommunications.io</p>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', borderBottom:`1px solid ${B.border}`, background:B.surface, padding:'0 20px', flexShrink:0 }}>
        {[['overview','📊 Overview'],['access','👥 Staff Access'],['convos','💬 Conversations']].map(([key,label])=>(
          <button key={key} onClick={()=>setAdminTab(key)}
            style={{ padding:'12px 16px', background:'none', border:'none', borderBottom:`2px solid ${adminTab===key?B.gold:'transparent'}`,
              color:adminTab===key?B.gold:B.muted, fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {adminTab==='overview' && (
        <div style={{ overflowY:'auto', flex:1 }}>
          <div style={{ padding:"16px 20px" }}>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : `repeat(${statCards.length},1fr)`, gap:10, marginBottom:20 }}>
              {statCards.map(({label,val})=>(
                <Card key={label} style={{ textAlign:"center" }}>
                  <p style={{ fontSize:20, fontWeight:700, color:B.gold, margin:"0 0 4px" }}>{val}</p>
                  <p style={{ fontSize:9, color:B.muted, margin:0, lineHeight:1.3 }}>{label}</p>
                </Card>
              ))}
            </div>
            {/* Per-coach check-in deadlines */}
            {dlCoaches.length > 0 && (
              <Card style={{ marginBottom:20 }}>
                <p style={{ fontSize:11, fontWeight:700, color:B.gold, letterSpacing:1, textTransform:"uppercase", margin:"0 0 4px" }}>⏰ Coach Check-In Deadlines</p>
                <p style={{ fontSize:11, color:B.muted, margin:"0 0 10px", lineHeight:1.5 }}>Each coach's clients follow that coach's deadline. Change any coach's time or timezone here.</p>
                {dlCoaches.map((c:any) => {
                  const dl = coachDl[c.id] || { tz: DEFAULT_TZ, time: DEFAULT_TIME };
                  return (
                    <div key={c.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderTop:`1px solid ${B.border}`, flexWrap:"wrap" }}>
                      <span style={{ flex:1, minWidth:120, fontSize:13, fontWeight:600, color:B.text }}><LN>{c.name}</LN></span>
                      <input type="time" value={dl.time}
                        onChange={e => { if (e.target.value) saveCoachDl(c.id, { deadline_time: e.target.value }, { time: e.target.value }); }}
                        style={{ background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"6px 8px", color:B.gold, fontSize:12, outline:"none", colorScheme:"dark" }}/>
                      <select value={dl.tz}
                        onChange={e => saveCoachDl(c.id, { timezone: e.target.value }, { tz: e.target.value })}
                        style={{ background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"6px 8px", color:B.gold, fontSize:12, outline:"none", cursor:"pointer" }}>
                        {TZ_OPTIONS.map((o:any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  );
                })}
              </Card>
            )}
            {/* Check-in form customization (org-wide or per coach) */}
            <Card style={{ marginBottom:20 }}>
              <p style={{ fontSize:11, fontWeight:700, color:B.gold, letterSpacing:1, textTransform:"uppercase", margin:"0 0 4px" }}>📝 Check-In Forms</p>
              <p style={{ fontSize:11, color:B.muted, margin:"0 0 10px", lineHeight:1.5 }}>
                Customize the weekly check-in form for the whole organization, or for one coach. Coaches without their own version use the organization's; everyone starts from the standard form.
              </p>
              <select value={formScope} onChange={e => setFormScope(e.target.value)}
                style={{ background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"8px 10px", color:B.gold, fontSize:12, outline:"none", cursor:"pointer", marginBottom: formScope ? 14 : 0, maxWidth:"100%" }}>
                <option value="">Choose what to edit…</option>
                <option value="org">🏢 Whole organization</option>
                {dlCoaches.map((c:any) => <option key={c.id} value={c.id}>👤 {c.name}</option>)}
              </select>
              {formScope && (
                <CheckinFormEditor key={formScope}
                  companyId={isOwnerHQ ? EDEN_COMPANY_ID : (myOrg?.id || EDEN_COMPANY_ID)}
                  coachId={formScope === 'org' ? null : formScope}
                  coachName={formScope === 'org' ? '' : (dlCoaches.find((c:any) => c.id === formScope)?.name || '')}
                  onClose={() => setFormScope('')}/>
              )}
            </Card>
            {/* Video huddles — per-org Daily.co connection */}
            <Card style={{ marginBottom:20 }}>
              <p style={{ fontSize:11, fontWeight:700, color:B.gold, letterSpacing:1, textTransform:"uppercase", margin:"0 0 4px" }}>🎥 Video Huddles</p>
              {huddleStatus === null ? (
                <p style={{ fontSize:12, color:B.muted, margin:0 }}>Checking connection…</p>
              ) : huddleStatus.connected ? (
                <>
                  <p style={{ fontSize:12, color:B.success || "#4FD89A", margin:"0 0 10px", lineHeight:1.5 }}>
                    ✅ Connected — your coaches can start live video huddles in Team Hub.
                    {huddleStatus.source === 'builtin' ? ' (Using the built-in Eden account.)' : ' (Using your own Daily.co account.)'}
                  </p>
                  {huddleStatus.source === 'own' && (
                    <Btn variant="secondary" onClick={removeDailyKey}>Disconnect Daily.co</Btn>
                  )}
                </>
              ) : (
                <>
                  <p style={{ fontSize:12, color:B.muted, margin:"0 0 10px", lineHeight:1.6 }}>
                    Give your coaches live video huddles by connecting your own free Daily.co account:
                    <br/>1. Sign up at <a href="https://dashboard.daily.co/signup" target="_blank" rel="noopener noreferrer" style={{ color:B.gold }}>dashboard.daily.co</a> (free — 1,000 call minutes/month)
                    <br/>2. Open <strong>Developers</strong> in their left menu
                    <br/>3. Copy the API key and paste it here:
                  </p>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <input type="password" value={dailyKeyInput} onChange={e => setDailyKeyInput(e.target.value)}
                      placeholder="Paste your Daily.co API key"
                      style={{ flex:1, minWidth:200, background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"9px 12px", color:B.text, fontSize:12, outline:"none" }}/>
                    <Btn onClick={saveDailyKey} disabled={dailySaving || !dailyKeyInput.trim()}>{dailySaving ? "Checking…" : "Connect"}</Btn>
                  </div>
                </>
              )}
              {dailyMsg && <p style={{ fontSize:12, color:dailyMsg.startsWith('✅') ? "#4FD89A" : "#ffa600", margin:"10px 0 0" }}>{dailyMsg}</p>}
            </Card>
            {/* Meta ads recaps — per-org connection, community + cadences */}
            <Card style={{ marginBottom:20 }}>
              <p style={{ fontSize:11, fontWeight:700, color:B.gold, letterSpacing:1, textTransform:"uppercase", margin:"0 0 4px" }}>📊 Meta Ads Recaps</p>
              {metaAds === null ? (
                <p style={{ fontSize:12, color:B.muted, margin:0 }}>Checking connection…</p>
              ) : !metaAds.connected ? (
                <>
                  <p style={{ fontSize:12, color:B.muted, margin:"0 0 10px", lineHeight:1.6 }}>
                    Post automatic ad recaps (spend, leads, cost per lead — plus <strong>who changed what</strong> in Ads Manager) into a community of your choice. Daily, weekly, and monthly.
                    <br/>1. Go to <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" style={{ color:B.gold }}>Meta Business Settings → System Users</a> — create one (or use an existing) and generate a token with <strong>ads_read</strong> permission for your ad account
                    <br/>2. Find your <strong>Ad Account ID</strong> in Ads Manager (the number after "act_" in the URL, or under Ad Account Settings)
                    <br/>3. Paste both here:
                  </p>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <input type="password" value={metaToken} onChange={e => setMetaToken(e.target.value)}
                      placeholder="Paste your Meta access token"
                      style={{ flex:2, minWidth:200, background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"9px 12px", color:B.text, fontSize:12, outline:"none" }}/>
                    <input value={metaAcct} onChange={e => setMetaAcct(e.target.value)}
                      placeholder="Ad account ID (numbers)"
                      style={{ flex:1, minWidth:140, background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"9px 12px", color:B.text, fontSize:12, outline:"none" }}/>
                    <Btn onClick={metaConnect} disabled={metaBusy || !metaToken.trim() || !metaAcct.trim()}>{metaBusy ? "Checking…" : "Connect"}</Btn>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize:12, color:"#4FD89A", margin:"0 0 10px", lineHeight:1.5 }}>
                    ✅ Connected to <strong>{metaAds.account_name || `account ${metaAds.ad_account_id}`}</strong>.
                  </p>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                    <span style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:0.5 }}>Post recaps into</span>
                    <select value={metaAds.community_id || ''} disabled={metaBusy}
                      onChange={e => e.target.value && metaSaveSettings({ communityId: e.target.value })}
                      style={{ background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"7px 10px", color:metaAds.community_id ? B.gold : B.text, fontSize:12, outline:"none", cursor:"pointer", maxWidth:"100%" }}>
                      <option value="">Choose a community…</option>
                      {metaCommunities.map((c:any) => <option key={c.id} value={c.id}>{c.context === 'team' ? '👥' : '💬'} {c.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:10 }}>
                    {[['daily','Daily'],['weekly','Weekly (Mondays)'],['monthly','Monthly (1st)']].map(([k, label]) => (
                      <label key={k} style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                        <input type="checkbox" checked={!!metaAds[k]} disabled={metaBusy || !metaAds.community_id}
                          onChange={e => metaSaveSettings({ [k]: e.target.checked })}/>
                        <span style={{ fontSize:12, color: metaAds[k] ? "#4FD89A" : B.muted, fontWeight:700 }}>{label}</span>
                      </label>
                    ))}
                  </div>
                  {!metaAds.community_id && <p style={{ fontSize:11, color:"#ffa600", margin:"0 0 10px" }}>Pick a community above to turn recaps on.</p>}
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <Btn variant="secondary" onClick={() => metaRunNow('daily')} disabled={metaBusy || !metaAds.community_id}>Post a test recap now</Btn>
                    <Btn variant="secondary" onClick={metaDisconnect} disabled={metaBusy}>Disconnect</Btn>
                  </div>
                </>
              )}
              {metaMsg && <p style={{ fontSize:12, color:metaMsg.startsWith('✅') ? "#4FD89A" : "#ffa600", margin:"10px 0 0" }}>{metaMsg}</p>}
            </Card>
            {/* GHL intake webhook — white-label self-serve */}
            {myOrg && (
              <Card style={{ marginBottom:20 }}>
                <p style={{ fontSize:11, fontWeight:700, color:B.gold, letterSpacing:1, textTransform:"uppercase", margin:"0 0 4px" }}>🔗 GHL / Zapier Intake Webhook</p>
                <p style={{ fontSize:11, color:B.muted, margin:"0 0 10px", lineHeight:1.6 }}>
                  Paste this webhook into a GHL workflow (trigger: <strong>Document/Contract Signed</strong>) or Zapier. When a contract is signed,
                  the client is created here automatically. Send the client's <strong>first_name</strong>, <strong>last_name</strong>, <strong>email</strong>,
                  and the coach's email as <strong>coach_email</strong>. Include the secret as an <strong>x-webhook-secret</strong> header on the request.
                </p>
                {ghlCfg === null && <p style={{ fontSize:12, color:B.muted, margin:0 }}>Loading…</p>}
                {ghlCfg === false && <p style={{ fontSize:12, color:"#ffa600", margin:0 }}>Couldn't load the webhook details — refresh the page or contact Eden support.</p>}
                {ghlCfg && ghlCfg.url && (
                  <>
                    {[['Webhook URL', ghlCfg.url], ['Secret', ghlCfg.secret]].map(([label, val]: any) => (
                      <div key={label} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, flexWrap:"wrap" }}>
                        <span style={{ fontSize:10, fontWeight:700, color:B.muted, width:90, textTransform:"uppercase", letterSpacing:0.5 }}>{label}</span>
                        <code style={{ flex:1, minWidth:180, fontSize:10, color:B.text, background:B.surface, border:`1px solid ${B.border}`, borderRadius:6, padding:"6px 8px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{val}</code>
                        <button onClick={() => ghlCopy(label, val)}
                          style={{ background: ghlCopied === label ? (B.success || '#4FD89A') : 'none', color: ghlCopied === label ? '#000' : B.gold, border:`1px solid ${B.border}`, borderRadius:6, padding:"5px 10px", fontSize:10, fontWeight:700, cursor:"pointer" }}>
                          {ghlCopied === label ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </Card>
            )}
            {/* Automated welcome messages */}
            <Card style={{ marginBottom:20 }}>
              <p style={{ fontSize:11, fontWeight:700, color:B.gold, letterSpacing:1, textTransform:"uppercase", margin:"0 0 4px" }}>👋 Automated Welcome Message</p>
              {welcomeCfg === null ? (
                <p style={{ fontSize:12, color:B.muted, margin:0 }}>Loading…</p>
              ) : (
                <>
                  <p style={{ fontSize:12, color:B.muted, margin:"0 0 10px", lineHeight:1.6 }}>
                    Sent automatically into a new client's chat with their coach the first time they open the app.
                    If a client doesn't have a coach yet, the welcome is sent from an admin account instead — so no one is left in silence.
                    You can use <code style={{ color:B.gold }}>{'{client_name}'}</code> and <code style={{ color:B.gold }}>{'{coach_name}'}</code> — they're filled in per client (for coachless clients, {'{coach_name}'} becomes the admin's name).
                  </p>
                  <label style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, cursor:"pointer" }}>
                    <input type="checkbox" checked={!!welcomeCfg.enabled}
                      onChange={e => saveWelcomeCfg({ ...welcomeCfg, enabled: e.target.checked })}/>
                    <span style={{ fontSize:12, color:welcomeCfg.enabled ? (B.success || "#4FD89A") : B.muted, fontWeight:700 }}>
                      {welcomeCfg.enabled ? 'On — new clients get a welcome message' : 'Paused — no welcome messages are sent'}
                    </span>
                  </label>
                  <textarea value={welcomeCfg.defaultText || ''} rows={3}
                    onChange={e => setWelcomeCfg({ ...welcomeCfg, defaultText: e.target.value })}
                    placeholder={"Hey {client_name}! Welcome — I'm {coach_name}, your coach. Message me here anytime…"}
                    style={{ width:"100%", boxSizing:"border-box", background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"9px 12px", color:B.text, fontSize:12, outline:"none", resize:"vertical", fontFamily:"inherit" }}/>
                  <div style={{ display:"flex", gap:8, alignItems:"center", margin:"8px 0 12px" }}>
                    <Btn onClick={() => saveWelcomeCfg(welcomeCfg)} disabled={welcomeSaving}>{welcomeSaving ? 'Saving…' : 'Save message'}</Btn>
                    {welcomeMsgStatus && <span style={{ fontSize:12, color: welcomeMsgStatus.startsWith('✅') ? "#4FD89A" : "#ffa600" }}>{welcomeMsgStatus}</span>}
                  </div>
                  {/* Per-coach customization */}
                  {(dlCoaches.length > 0 || welcomeAdmins.length > 0) && (
                    <div style={{ borderTop:`1px solid ${B.border}`, paddingTop:10 }}>
                      <p style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:.6, textTransform:"uppercase", margin:"0 0 6px" }}>Customize per sender (optional)</p>
                      <p style={{ fontSize:11, color:B.muted, margin:"0 0 6px" }}>Coaches welcome their own clients. Clients without a coach yet get their welcome from an admin.</p>
                      {[...dlCoaches, ...welcomeAdmins.filter((a:any) => !dlCoaches.some((c:any) => c.id === a.id)).map((a:any) => ({ ...a, isAdmin: true }))].map((c:any) => {
                        const ov = welcomeCfg.perCoach?.[c.id] || {};
                        const open = welcomeCoachOpen === c.id;
                        return (
                          <div key={c.id} style={{ borderBottom:`1px solid ${B.border}` }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0" }}>
                              <span style={{ flex:1, fontSize:12, color:B.text, fontWeight:600 }}><LN>{c.name}</LN>{c.isAdmin && <span style={{ fontSize:10, color:B.muted, fontWeight:600 }}> · admin</span>}</span>
                              {ov.paused && <span style={{ fontSize:10, color:"#ffa600", fontWeight:700 }}>PAUSED</span>}
                              {!ov.paused && ov.text && <span style={{ fontSize:10, color:B.gold, fontWeight:700 }}>CUSTOM</span>}
                              {!ov.paused && !ov.text && <span style={{ fontSize:10, color:B.muted }}>uses default</span>}
                              <button onClick={() => setWelcomeCoachOpen(open ? '' : c.id)}
                                style={{ background:"none", border:`1px solid ${B.border}`, borderRadius:6, padding:"3px 10px", color:B.muted, fontSize:10, cursor:"pointer" }}>
                                {open ? 'Close' : 'Customize'}
                              </button>
                            </div>
                            {open && (
                              <div style={{ padding:"0 0 10px" }}>
                                <textarea value={ov.text || ''} rows={2}
                                  onChange={e => setWelcomeCfg({ ...welcomeCfg, perCoach: { ...welcomeCfg.perCoach, [c.id]: { ...ov, text: e.target.value } } })}
                                  placeholder="Custom welcome for this coach's clients (leave empty to use the default)…"
                                  style={{ width:"100%", boxSizing:"border-box", background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"8px 10px", color:B.text, fontSize:12, outline:"none", resize:"vertical", fontFamily:"inherit" }}/>
                                <div style={{ display:"flex", gap:10, alignItems:"center", marginTop:6 }}>
                                  <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:11, color:B.muted }}>
                                    <input type="checkbox" checked={!!ov.paused}
                                      onChange={e => setWelcomeCfg({ ...welcomeCfg, perCoach: { ...welcomeCfg.perCoach, [c.id]: { ...ov, paused: e.target.checked } } })}/>
                                    Pause welcomes for this coach's clients
                                  </label>
                                  <Btn onClick={() => saveWelcomeCfg(welcomeCfg)} disabled={welcomeSaving}>{welcomeSaving ? 'Saving…' : 'Save'}</Btn>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </Card>
            {/* Bulk roster import / export */}
            <RosterImportExport/>
            {/* Upcoming contract starts (org-wide) */}
            <UpcomingStartsSection clients={upcomingClients}/>
            {/* White-label admin: branded login link */}
            {!isOwnerHQ && myOrg && (() => {
              const brandedUrl = `${window.location.origin}${(import.meta.env.BASE_URL || '/').replace(/\/+$/, '')}/${myOrg.slug}`;
              const accent = myOrg.brand_color || B.gold;
              return (
                <Card style={{ marginBottom:20, borderLeft:`3px solid ${accent}` }}>
                  <p style={{ fontSize:11, fontWeight:700, color:accent, letterSpacing:1, textTransform:"uppercase", margin:"0 0 6px" }}>🔗 Your Branded Login Link</p>
                  <p style={{ fontSize:12, color:B.muted, margin:"0 0 10px", lineHeight:1.5 }}>Share this link with your coaches and clients — the sign-in page will show {myOrg.name}'s branding.</p>
                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    <code style={{ flex:1, minWidth:180, fontSize:11, color:B.text, background:B.dim, border:`1px solid ${B.border}`, borderRadius:8, padding:"9px 10px", overflowX:"auto", whiteSpace:"nowrap" }}>{brandedUrl}</code>
                    <button onClick={async ()=>{
                        try { await navigator.clipboard.writeText(brandedUrl); }
                        catch { const ta=document.createElement('textarea'); ta.value=brandedUrl; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
                        setLinkCopied(true); setTimeout(()=>setLinkCopied(false), 2000);
                      }}
                      style={{ background:linkCopied?B.success:accent, color:"#000", border:"none", borderRadius:8, padding:"9px 14px", fontSize:12, fontWeight:800, cursor:"pointer", flexShrink:0 }}>
                      {linkCopied ? "✓ Copied" : "Copy Link"}
                    </button>
                  </div>
                </Card>
              );
            })()}
            {/* White-label admin: DBAs (sub-brands) — hidden unless the plan includes them */}
            {!isOwnerHQ && myOrg && <DbaManagerCard org={myOrg}/>}
            {/* Owner HQ: manage any organization's DBAs (incl. Lifestyle of Eden University) */}
            {isOwnerHQ && <HqDbaManager orgs={dbOrgs}/>}
            {/* White-label admin: org logo */}
            {!isOwnerHQ && myOrg && (() => {
              const accent = myOrg.brand_color || B.gold;
              const isDataUrl = (logoDraft || '').startsWith('data:');
              return (
                <Card style={{ marginBottom:20, borderLeft:`3px solid ${accent}` }}>
                  <p style={{ fontSize:11, fontWeight:700, color:accent, letterSpacing:1, textTransform:"uppercase", margin:"0 0 6px" }}>🖼 Your Logo</p>
                  <p style={{ fontSize:12, color:B.muted, margin:"0 0 12px", lineHeight:1.5 }}>Shown on your branded login page and in the app header. Without a logo, your brand initial is shown instead.</p>
                  <div style={{ display:"flex", gap:14, alignItems:"center", flexWrap:"wrap" }}>
                    <OrgLogo org={myOrg} size={56}/>
                    <div style={{ flex:1, minWidth:220 }}>
                      <input type="text" value={isDataUrl ? '(uploaded image)' : logoDraft} readOnly={isDataUrl}
                        onChange={e=>{ setLogoDraft(e.target.value); setLogoError(''); }}
                        placeholder="https://yourdomain.com/logo.png"
                        style={{ width:"100%", background:B.dim, border:`1px solid ${B.border}`, borderRadius:8, padding:"9px 10px", color:B.text, fontSize:12, outline:"none", boxSizing:"border-box", fontFamily:"inherit", marginBottom:8 }}/>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                        <button onClick={()=>saveLogo(logoDraft)} disabled={logoSaving || isDataUrl}
                          style={{ background:logoSaved?B.success:accent, color:"#000", border:"none", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:800, cursor:logoSaving?"wait":"pointer", opacity:(logoSaving||isDataUrl)?0.6:1 }}>
                          {logoSaved ? "✓ Saved" : logoSaving ? "Saving…" : "Save Logo URL"}
                        </button>
                        <button onClick={()=>logoFileRef.current?.click()} disabled={logoSaving}
                          style={{ background:B.card, color:B.text, border:`1px solid ${B.border}`, borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                          Upload Image…
                        </button>
                        {myOrg.logo_url && (
                          <button onClick={()=>{ setLogoDraft(''); saveLogo(''); }} disabled={logoSaving}
                            style={{ background:"none", color:B.danger, border:`1px solid ${B.danger}44`, borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                            Remove
                          </button>
                        )}
                      </div>
                      <input ref={logoFileRef} type="file" accept="image/*" style={{ display:"none" }}
                        onChange={e=>{ onLogoFile(e.target.files?.[0] || null); e.target.value=''; }}/>
                      {logoError && <p style={{ fontSize:11, color:B.danger, margin:"8px 0 0" }}>{logoError}</p>}
                    </div>
                  </div>
                </Card>
              );
            })()}
            {/* White-label admin: brand colors */}
            {!isOwnerHQ && myOrg && (() => {
              const accent = myOrg.brand_color || B.gold;
              const previewPrimary = isHex6(colorDraft) ? colorDraft.trim() : accent;
              return (
                <Card style={{ marginBottom:20, borderLeft:`3px solid ${accent}` }}>
                  <p style={{ fontSize:11, fontWeight:700, color:accent, letterSpacing:1, textTransform:"uppercase", margin:"0 0 6px" }}>🎨 Your Brand Colors</p>
                  <p style={{ fontSize:12, color:B.muted, margin:"0 0 12px", lineHeight:1.5 }}>Your primary color themes your branded login page and in-app accents. Optionally add palette colors used for charts and highlights.</p>
                  {/* Primary color */}
                  <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:12 }}>
                    <label style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", width:70, flexShrink:0 }}>Primary</label>
                    <input type="color" value={isHex6(colorDraft) ? colorDraft.trim() : '#ffa600'}
                      onChange={e=>{ setColorDraft(e.target.value); setColorError(''); }}
                      style={{ width:40, height:34, padding:2, background:B.dim, border:`1px solid ${B.border}`, borderRadius:8, cursor:"pointer" }}/>
                    <input type="text" value={colorDraft}
                      onChange={e=>{ setColorDraft(e.target.value); setColorError(''); }}
                      placeholder="#ffa600" maxLength={7}
                      style={{ width:100, background:B.dim, border:`1px solid ${B.border}`, borderRadius:8, padding:"8px 10px", color:B.text, fontSize:12, outline:"none", boxSizing:"border-box", fontFamily:"monospace" }}/>
                    <span style={{ fontSize:11, fontWeight:800, color:"#000", background:previewPrimary, borderRadius:8, padding:"8px 12px" }}>Preview</span>
                  </div>
                  {/* Palette colors */}
                  {paletteDraft.map((c, i) => (
                    <div key={i} style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:10 }}>
                      <label style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", width:70, flexShrink:0 }}>Color {i+2}</label>
                      <input type="color" value={isHex6(c) ? c.trim() : '#888888'}
                        onChange={e=>{ setPaletteDraft(p => p.map((v,j)=> j===i ? e.target.value : v)); setColorError(''); }}
                        style={{ width:40, height:34, padding:2, background:B.dim, border:`1px solid ${B.border}`, borderRadius:8, cursor:"pointer" }}/>
                      <input type="text" value={c}
                        onChange={e=>{ setPaletteDraft(p => p.map((v,j)=> j===i ? e.target.value : v)); setColorError(''); }}
                        placeholder="#6FB8E8" maxLength={7}
                        style={{ width:100, background:B.dim, border:`1px solid ${B.border}`, borderRadius:8, padding:"8px 10px", color:B.text, fontSize:12, outline:"none", boxSizing:"border-box", fontFamily:"monospace" }}/>
                      <button onClick={()=>{ setPaletteDraft(p => p.filter((_,j)=>j!==i)); setColorError(''); }}
                        style={{ background:"none", color:B.danger, border:`1px solid ${B.danger}44`, borderRadius:8, padding:"7px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                        Remove
                      </button>
                    </div>
                  ))}
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
                    <button onClick={saveColors} disabled={colorSaving}
                      style={{ background:colorSaved?B.success:accent, color:"#000", border:"none", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:800, cursor:colorSaving?"wait":"pointer", opacity:colorSaving?0.6:1 }}>
                      {colorSaved ? "✓ Saved" : colorSaving ? "Saving…" : "Save Colors"}
                    </button>
                    {paletteDraft.length < 5 && (
                      <button onClick={()=>setPaletteDraft(p => [...p, '#6FB8E8'])} disabled={colorSaving}
                        style={{ background:B.card, color:B.text, border:`1px solid ${B.border}`, borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                        + Add Palette Color
                      </button>
                    )}
                  </div>
                  {colorError && <p style={{ fontSize:11, color:B.danger, margin:"8px 0 0" }}>{colorError}</p>}
                  <p style={{ fontSize:10, color:B.muted, margin:"10px 0 0" }}>Changes apply to your branded login page and app theme after a refresh.</p>
                </Card>
              );
            })()}
            {isOwnerHQ && (<>
            <p style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 12px" }}>Organizations</p>
            {orgs.map((o:any,i:number)=>(
              <Card key={i} style={{ marginBottom:10, borderLeft:`3px solid ${o.color}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <p style={{ fontSize:14, fontWeight:700, color:B.text, margin:"0 0 4px" }}><LN>{o.name}</LN></p>
                    <p style={{ fontSize:11, color:B.muted, margin:0 }}>
                      {o.plan
                        ? <>
                            <span style={{ textTransform:'capitalize' }}>{o.plan}</span>
                            {o.isWhiteLabel && planPrices[(o.plan||'').toLowerCase()] != null &&
                              <span style={{ color:B.gold }}> · ${planPrices[(o.plan||'').toLowerCase()]}/mo</span>}
                            {!o.isWhiteLabel && ' · Platform owner'}
                          </>
                        : `${o.coaches} coaches · ${o.clients} clients`}
                    </p>
                  </div>
                  {o.row && <Btn variant="ghost" onClick={()=>setManageOrg(o.row)} style={{ fontSize:11, padding:"4px 0" }}>Manage →</Btn>}
                </div>
              </Card>
            ))}
            </>)}
            <Divider/>
            <div style={{ marginTop:12, padding:"12px 14px", background:`${B.gold}11`, border:`1px solid ${B.gold}33`, borderRadius:10 }}>
              <p style={{ fontSize:11, fontWeight:700, color:B.gold, margin:"0 0 4px" }}>🔒 SECURITY STATUS</p>
              <p style={{ fontSize:12, color:B.muted, margin:0 }}>Encrypted in transit (TLS) and at rest (AES-256) · Private client & coach data</p>
            </div>
          </div>
        </div>
      )}

      {/* Staff Access */}
      {adminTab==='access' && <StaffAccessManager user={user}/>}

      {/* Conversations — admin reads all coach↔client threads */}
      {adminTab==='convos' && <AdminConversationMonitor user={user}/>}

      {/* Activity — audit trail: who did what, and when */}
      {adminTab==='activity' && <AdminActivityLog user={user}/>}

      {/* Eden HQ: edit an org's name, colors & logo */}
      {manageOrg && (
        <OrgBrandingEditor org={manageOrg}
          onClose={()=>setManageOrg(null)}
          onSaved={(updated:any)=>{
            setManageOrg(updated);
            setDbOrgs(list => Array.isArray(list) ? list.map((o:any)=> o.id===updated.id ? { ...o, ...updated } : o) : list);
          }}/>
      )}
    </Screen>
  );
};

// ─── CLIENT PROGRESS SCREEN ──────────────────────────────────────────────────
// Clients see: past check-ins (with coach feedback) | coach Loom updates | progress photos

const DEMO_PROGRESS_CHECKINS = [
  { id:1, submitted_at:'2026-07-09', weight:'148.0', temp:'97.6', steps:'9,200', heartRate:'62', hrv:'68', bloodPressure:'118/74',
    energy:7, sleep:6, bloating:7, brainFog:7, sexDrive:6, hunger:4, stress:5, compliance:92, mood:'Motivated',
    sleepWindow:'10:30 PM – 6:00 AM', sleepCycles:'5', sleepDisruption:'',
    bowelCount:'2', bowelType:'Well formed',
    notes:'Feeling good this week! Energy is up and sleep has improved.',
    coach_notes:'Great compliance. Bump protein 10g on high days next week. Keep the morning walks.' },
  { id:2, submitted_at:'2026-07-02', weight:'149.0', temp:'97.4', steps:'7,800', heartRate:'68', hrv:'58', bloodPressure:'122/78',
    energy:6, sleep:5, bloating:6, brainFog:5, sexDrive:5, hunger:7, stress:7, compliance:85, mood:'Stressed',
    sleepWindow:'11:30 PM – 6:30 AM', sleepCycles:'4', sleepDisruption:'Woke twice around 2 AM — racing thoughts.',
    bowelCount:'1', bowelType:'Loose',
    notes:'Work has been hectic this week. Missed a couple workouts.',
    coach_notes:'Stress management is the priority right now. Reviewed sleep protocol — add magnesium.' },
  { id:3, submitted_at:'2026-06-25', weight:'150.0', temp:'97.8', steps:'8,500', heartRate:'64', hrv:'62', bloodPressure:'120/76',
    energy:6, sleep:6, bloating:4, brainFog:6, sexDrive:5, hunger:5, stress:6, compliance:88, mood:'Neutral',
    sleepWindow:'11:00 PM – 6:30 AM', sleepCycles:'4', sleepDisruption:'Mild gut discomfort mid-night.',
    bowelCount:'2', bowelType:'Well formed',
    notes:'Digestion felt off mid-week. Had some bloating after meals.',
    coach_notes:'Adding digestive enzymes with meals. Will update supplement protocol on our next call.' },
  { id:4, submitted_at:'2026-06-18', weight:'151.0', temp:'98.1', steps:'6,200', heartRate:'72', hrv:'52', bloodPressure:'124/80',
    energy:5, sleep:5, bloating:3, brainFog:4, sexDrive:4, hunger:8, stress:8, compliance:80, mood:'Tired',
    sleepWindow:'12:00 AM – 6:00 AM', sleepCycles:'3–4', sleepDisruption:'Woke multiple times — hotel, noisy environment.',
    bowelCount:'1', bowelType:'Loose',
    notes:'Rough week — traveled for work, hard to stay on protocol.',
    coach_notes:'Travel protocols reviewed together. Pack snacks, electrolytes, keep the meal timing.' },
  { id:5, submitted_at:'2026-06-11', weight:'152.0', temp:'97.5', steps:'10,400', heartRate:'60', hrv:'74', bloodPressure:'116/72',
    energy:8, sleep:8, bloating:8, brainFog:8, sexDrive:8, hunger:3, stress:4, compliance:96, mood:'Great',
    sleepWindow:'10:00 PM – 5:30 AM', sleepCycles:'5', sleepDisruption:'',
    bowelCount:'2', bowelType:'Well formed',
    notes:'Best week so far! Everything clicked — workouts, sleep, and diet all aligned.',
    coach_notes:'96% compliance is elite. This is your new baseline. Keep this energy going into next week.' },
  { id:6, submitted_at:'2026-06-04', weight:'152.5', temp:'97.7', steps:'9,600', heartRate:'63', hrv:'70', bloodPressure:'119/75',
    energy:7, sleep:7, bloating:7, brainFog:7, sexDrive:6, hunger:4, stress:5, compliance:90, mood:'Good',
    sleepWindow:'10:45 PM – 6:15 AM', sleepCycles:'5', sleepDisruption:'',
    bowelCount:'2', bowelType:'Well formed',
    notes:'Good week overall. Getting used to the new routine.',
    coach_notes:'Solid. Consistency is building. Stay the course.' },
]


const DEMO_PROGRESS_PHOTOS = [
  { id:1, week_label:'Week 12', taken_at:'2026-07-06', photo_url:'', notes:'Front, side, back' },
  { id:2, week_label:'Week 8',  taken_at:'2026-06-08', photo_url:'', notes:'Front, side, back' },
  { id:3, week_label:'Week 4',  taken_at:'2026-05-11', photo_url:'', notes:'Front, side, back' },
  { id:4, week_label:'Week 1',  taken_at:'2026-04-20', photo_url:'', notes:'Starting photos' },
]

function loomToEmbed(url: string): string {
  if (!url) return ''
  // https://www.loom.com/share/XXXX → https://www.loom.com/embed/XXXX
  return url.replace('loom.com/share/', 'loom.com/embed/')
}

function scoreCol(v: number): string {
  return v >= 7 ? B.success : v >= 5 ? B.gold : '#ff6b6b'
}

function ClientProgressScreen({ currentUser }: { currentUser: any }) {
  const isMobile = useIsMobile()
  const [subTab, setSubTab] = useState<'checkins'|'photos'>('checkins')
  const [checkins,  setCheckins]  = useState<any[]|null>(null)
  const [photos,    setPhotos]    = useState<any[]|null>(null)
  const [uploading, setUploading] = useState(false)
  const [expanded,  setExpanded]  = useState<number|null>(null)
  const [modalIdx,  setModalIdx]  = useState<number|null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Close modal on Escape, navigate with arrow keys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (modalIdx === null) return
      if (e.key === 'Escape') { setModalIdx(null); return }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setModalIdx(i => (i !== null && checkins && i < checkins.length - 1) ? i + 1 : i)
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setModalIdx(i => (i !== null && i > 0) ? i - 1 : i)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalIdx, checkins])

  // Determine UUID — works for demo and live Supabase users
  // KNOWN_USERS is defined in Messaging.jsx scope; in App.tsx we use the email to query user_profiles
  const myEmail = currentUser?.email

  useEffect(() => { load() }, [myEmail])

  async function load() {
    // Try to find UUID from user_profiles
    let uuid: string|null = null
    try {
      const profile = await sbGet('user_profiles', `email=eq.${encodeURIComponent(myEmail||'')}`)
      uuid = profile?.[0]?.id || null
    } catch {}

    const [c, p] = await Promise.all([
      uuid ? sbGet('weekly_checkins', `client_id=eq.${uuid}&order=submitted_at.desc&limit=24`) : Promise.resolve([]),
      uuid ? sbGet('progress_photos', `client_id=eq.${uuid}&order=taken_at.desc&limit=60`)     : Promise.resolve([]),
    ])

    setCheckins(Array.isArray(c) && c.length ? c : DEMO_PROGRESS_CHECKINS)
    setPhotos(  Array.isArray(p) && p.length ? p : DEMO_PROGRESS_PHOTOS)
  }

  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Get UUID for storage path
    let uuid: string|null = null
    try { const r = await sbGet('user_profiles', `email=eq.${encodeURIComponent(myEmail||'')}`); uuid = r?.[0]?.id || null } catch {}
    if (!uuid) { alert('Could not identify your account. Please contact support.'); return }
    setUploading(true)
    try {
      const path = `${uuid}/${Date.now()}-${file.name}`
      const upRes = await fetch(`${SB_URL}/storage/v1/object/progress-photos/${path}`, {
        method:'POST', headers:{ 'apikey':SB_ANON, get Authorization(){ return sbBearer() }, 'Content-Type':file.type }, body:file,
      })
      if (!upRes.ok) throw new Error('upload failed')
      const photoUrl = `${SB_URL}/storage/v1/object/public/progress-photos/${path}`
      const weekNum = (photos?.length || 0) + 1
      await sbInsert('progress_photos', {
        client_id: uuid, week_label: `Week ${weekNum}`,
        photo_url: photoUrl, file_name: file.name, file_size: file.size,
        taken_at: new Date().toISOString(),
      })
      await load()
    } catch { alert('Upload failed. Make sure the progress-photos storage bucket exists in Supabase.') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  // Weight chart data — last 8 entries reversed so oldest → newest
  const weightData = (checkins || []).slice(0,8).reverse().map((ci:any) => ({
    date:   (ci.submitted_at||'').slice(5,10),
    weight: parseFloat(ci.weight) || null,
  })).filter((d:any) => d.weight)

  // Group photos by week_label
  const photosByWeek: Record<string,any[]> = {}
  for (const p of (photos||[])) {
    const k = p.week_label || 'Uncategorized'
    if (!photosByWeek[k]) photosByWeek[k] = []
    photosByWeek[k].push(p)
  }

  const TABS = [
    { key:'checkins', label:'📊 Check-ins' },
    { key:'photos',   label:'📸 Photos' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:B.black, overflow:'hidden' }}>

      {/* Header + sub-tab bar */}
      <div style={{ background:B.surface, borderBottom:`1px solid ${B.border}`, flexShrink:0,
        padding: isMobile ? '14px 16px 0' : '16px 20px 0' }}>
        <div style={{ fontSize:16, fontWeight:800, color:B.white }}>My Progress</div>
        <div style={{ fontSize:11, color:B.muted, marginBottom:12 }}>Check-ins · Progress photos</div>
        <div style={{ display:'flex', gap:0, overflowX:'auto', scrollbarWidth:'none' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setSubTab(t.key as any)}
              style={{ padding:'10px 16px', background:'none', border:'none', flexShrink:0,
                borderBottom:`2px solid ${subTab===t.key?B.gold:'transparent'}`,
                color:subTab===t.key?B.gold:B.muted, fontSize:12,
                fontWeight:subTab===t.key?700:400, cursor:'pointer', whiteSpace:'nowrap' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex:1, overflowY:'auto', padding: isMobile ? '16px 14px 32px' : '20px 20px 32px' }}>

        {/* ── CHECK-INS ──────────────────────────────────────────────── */}
        {subTab === 'checkins' && (<>

          {/* Weight trend chart */}
          {weightData.length > 1 && (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'14px 16px', marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>⚖️ Weight Trend</div>
              <ResponsiveContainer width="100%" height={110}>
                <AreaChart data={weightData} margin={{ top:4, right:4, bottom:0, left:-24 }}>
                  <defs>
                    <linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={B.gold} stopOpacity={0.3}/>
                      <stop offset="100%" stopColor={B.gold} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={B.border} vertical={false}/>
                  <XAxis dataKey="date" tick={{ fontSize:9, fill:B.muted }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize:9, fill:B.muted }} axisLine={false} tickLine={false} domain={['dataMin - 1','dataMax + 1']}/>
                  <Tooltip contentStyle={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:8, fontSize:11 }} itemStyle={{ color:B.gold }}/>
                  <Area type="monotone" dataKey="weight" stroke={B.gold} strokeWidth={2} fill="url(#wgrad)" dot={{ fill:B.gold, r:3 }}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Check-in cards */}
          {checkins === null ? (
            <div style={{ textAlign:'center', padding:40, color:B.muted }}>Loading…</div>
          ) : checkins.length === 0 ? (
            <div style={{ textAlign:'center', padding:40 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
              <div style={{ fontSize:14, fontWeight:700, color:B.white, marginBottom:6 }}>No check-ins yet</div>
              <div style={{ fontSize:12, color:B.muted }}>Submit your first weekly check-in to start tracking.</div>
            </div>
          ) : checkins.map((ci:any, idx:number) => {
            const open = expanded === idx
            const dt   = ci.submitted_at ? new Date(ci.submitted_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''
            return (
              <div key={ci.id||idx} style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, marginBottom:12, overflow:'hidden' }}>

                {/* Always-visible header row */}
                <div style={{ display:'flex', alignItems:'stretch' }}>
                  <button onClick={() => setExpanded(open ? null : idx)}
                    style={{ flex:1, background:'none', border:'none', padding:'14px 16px', cursor:'pointer', textAlign:'left' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:3 }}>
                          <span style={{ fontSize:13, fontWeight:700, color:B.white }}>{dt}</span>
                          {ci.weight && <span style={{ fontSize:12, color:B.gold, fontWeight:700 }}>⚖ {ci.weight} lbs</span>}
                          {ci.compliance != null && (
                            <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20,
                              background: ci.compliance>=90?`${B.success}22`:ci.compliance>=75?`${B.gold}22`:'#ff444422',
                              color:      ci.compliance>=90?B.success:ci.compliance>=75?B.gold:'#ff6b6b' }}>
                              {ci.compliance}% compliance
                            </span>
                          )}
                        </div>
                        {ci.mood && <div style={{ fontSize:11, color:B.muted }}>Mood: {ci.mood}</div>}
                      </div>
                      {/* Mini score circles */}
                      <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                        {([['E', ci.energy], ['S', ci.sleep], ['St', ci.stress ? 10 - ci.stress : null]] as [string,number|null][]).map(([l,v]) => v != null && (
                          <div key={l} style={{ width:30, height:30, borderRadius:15,
                            background:`${scoreCol(v)}18`, border:`1px solid ${scoreCol(v)}55`,
                            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                            <span style={{ fontSize:7, color:scoreCol(v), fontWeight:700, lineHeight:1 }}>{l}</span>
                            <span style={{ fontSize:9, color:scoreCol(v), fontWeight:800, lineHeight:1 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                      <span style={{ color:B.muted, fontSize:14 }}>{open ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {/* Expand to full-screen button */}
                  <button onClick={() => setModalIdx(idx)} title="Open full view"
                    style={{ flexShrink:0, background:'none', border:'none', borderLeft:`1px solid ${B.border}`,
                      padding:'0 14px', cursor:'pointer', color:B.muted, fontSize:15, display:'flex',
                      alignItems:'center', gap:4 }}>
                    <span style={{ fontSize:13 }}>⛶</span>
                  </button>
                </div>

                {/* Expanded detail */}
                {open && (
                  <div style={{ borderTop:`1px solid ${B.border}`, padding:'14px 16px' }}>

                    {/* Score grid — all 7 wellbeing scales */}
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(76px, 1fr))', gap:8, marginBottom:14 }}>
                      {([
                        ['Energy',    ci.energy],
                        ['Sleep',     ci.sleep],
                        ['Bloating',  ci.bloating],
                        ['Brain Fog', ci.brainFog],
                        ['Sex Drive', ci.sexDrive],
                        ['Hunger',    ci.hunger ? 10-ci.hunger : null],
                        ['Stress',    ci.stress  ? 10-ci.stress  : null],
                      ] as [string, number|null][]).map(([l,v]) => v != null && (
                        <div key={l} style={{ background:B.surface, borderRadius:10, padding:'8px 6px', textAlign:'center' }}>
                          <div style={{ fontSize:8, color:B.muted, fontWeight:700, letterSpacing:0.5, textTransform:'uppercase', marginBottom:4, lineHeight:1.2 }}>{l}</div>
                          <div style={{ fontSize:18, fontWeight:800, color:scoreCol(v), lineHeight:1 }}>{v}</div>
                          <div style={{ fontSize:8, color:B.muted }}>/ 10</div>
                        </div>
                      ))}
                    </div>

                    {/* Vitals */}
                    {(ci.weight || ci.temp || ci.heartRate || ci.hrv || ci.steps || ci.bloodPressure) && (
                      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:12, paddingBottom:12, borderBottom:`1px solid ${B.border}` }}>
                        {ci.weight        && <span style={{ fontSize:11, color:B.muted }}>⚖️ {ci.weight} lbs</span>}
                        {ci.temp          && <span style={{ fontSize:11, color:B.muted }}>🌡️ {ci.temp}°F</span>}
                        {ci.heartRate     && <span style={{ fontSize:11, color:B.muted }}>❤️ {ci.heartRate} BPM</span>}
                        {ci.hrv           && <span style={{ fontSize:11, color:B.muted }}>📡 HRV {ci.hrv}</span>}
                        {ci.steps         && <span style={{ fontSize:11, color:B.muted }}>👟 {ci.steps} steps</span>}
                        {ci.bloodPressure && <span style={{ fontSize:11, color:B.muted }}>🩺 {ci.bloodPressure}</span>}
                      </div>
                    )}

                    {/* Sleep details */}
                    {(ci.sleepWindow || ci.sleepCycles || ci.sleepDisruption) && (
                      <div style={{ marginBottom:12, paddingBottom:12, borderBottom:`1px solid ${B.border}` }}>
                        <div style={{ fontSize:10, color:B.muted, fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', marginBottom:6 }}>🌙 Sleep Details</div>
                        <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom: ci.sleepDisruption ? 8 : 0 }}>
                          {ci.sleepWindow  && <span style={{ fontSize:11, color:B.text }}>🕙 {ci.sleepWindow}</span>}
                          {ci.sleepCycles  && <span style={{ fontSize:11, color:B.text }}>🔄 {ci.sleepCycles} cycles</span>}
                        </div>
                        {ci.sleepDisruption && (
                          <div style={{ fontSize:11, color:B.muted, fontStyle:'italic', background:B.surface, borderRadius:8, padding:'8px 10px' }}>
                            {ci.sleepDisruption}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Digestion */}
                    {(ci.bowelCount || ci.bowelType) && (
                      <div style={{ marginBottom:12, paddingBottom:12, borderBottom:`1px solid ${B.border}` }}>
                        <div style={{ fontSize:10, color:B.muted, fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', marginBottom:6 }}>🫁 Digestion</div>
                        <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                          {ci.bowelCount && <span style={{ fontSize:11, color:B.text }}>💧 {ci.bowelCount}x daily</span>}
                          {ci.bowelType  && <span style={{ fontSize:11, color:B.text }}>📊 {ci.bowelType}</span>}
                        </div>
                      </div>
                    )}

                    {/* Client notes */}
                    {ci.notes && (
                      <div style={{ marginBottom:12 }}>
                        <div style={{ fontSize:10, color:B.muted, fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', marginBottom:5 }}>Your Notes</div>
                        <div style={{ fontSize:12, color:B.text, lineHeight:1.6, background:B.surface, borderRadius:8, padding:'10px 12px' }}>{ci.notes}</div>
                      </div>
                    )}

                    {/* Coach feedback */}
                    {ci.coach_notes && (
                      <div style={{ borderLeft:`3px solid ${B.gold}`, paddingLeft:12 }}>
                        <div style={{ fontSize:10, color:B.gold, fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', marginBottom:5 }}>💬 Coach Feedback</div>
                        <div style={{ fontSize:12, color:B.text, lineHeight:1.6 }}>{ci.coach_notes}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </>)}

        {/* ── COACH UPDATES ──────────────────────────────────────────── */}
        {/* ── PHOTOS ─────────────────────────────────────────────────── */}
        {subTab === 'photos' && (<>
          <input type="file" ref={fileRef} accept="image/*" style={{ display:'none' }} onChange={uploadPhoto}/>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ width:'100%', background:'none', border:`2px dashed ${B.gold}66`, borderRadius:12,
              padding:'18px', color:B.gold, fontSize:13, fontWeight:700,
              cursor:uploading?'not-allowed':'pointer', marginBottom:6,
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              opacity:uploading?0.5:1 }}>
            {uploading ? '⏳ Uploading…' : '📸 Upload Progress Photo'}
          </button>
          <div style={{ fontSize:11, color:B.muted, textAlign:'center', marginBottom:20 }}>
            Upload front, side, and back — your coach can see these
          </div>

          {photos === null ? (
            <div style={{ textAlign:'center', padding:40, color:B.muted }}>Loading…</div>
          ) : Object.keys(photosByWeek).length === 0 ? (
            <div style={{ textAlign:'center', padding:40 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📸</div>
              <div style={{ fontSize:14, fontWeight:700, color:B.white, marginBottom:6 }}>No photos yet</div>
              <div style={{ fontSize:12, color:B.muted }}>Tap the button above to upload your first progress photos.</div>
            </div>
          ) : Object.entries(photosByWeek).map(([week, wPhotos]) => (
            <div key={week} style={{ marginBottom:22 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:B.white }}>{week}</div>
                  <div style={{ fontSize:11, color:B.muted }}>
                    {(wPhotos[0] as any).taken_at ? new Date((wPhotos[0] as any).taken_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''}
                  </div>
                </div>
                <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background:`${B.gold}22`, color:B.gold }}>
                  {wPhotos.length} photo{wPhotos.length!==1?'s':''}
                </span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
                {(wPhotos as any[]).map((p:any, i:number) => (
                  p.photo_url ? (
                    <a key={i} href={p.photo_url} target="_blank" rel="noreferrer" style={{ display:'block' }}>
                      <img src={p.photo_url} alt={`${week} photo ${i+1}`}
                        style={{ width:'100%', aspectRatio:'3/4', objectFit:'cover', borderRadius:10, display:'block', border:`1px solid ${B.border}` }}/>
                    </a>
                  ) : (
                    <div key={i} style={{ aspectRatio:'3/4', background:B.surface, border:`1px solid ${B.border}`,
                      borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4 }}>
                      <Ic n="photos" size={22} c={B.muted}/>
                      <span style={{ fontSize:9, color:B.muted }}>{p.notes||'Photo'}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          ))}
        </>)}

      </div>

      {/* ── FULL-SCREEN CHECK-IN MODAL ────────────────────────────────── */}
      {modalIdx !== null && checkins && checkins[modalIdx] && (() => {
        const ci  = checkins[modalIdx]
        const dt  = ci.submitted_at ? new Date(ci.submitted_at).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}) : ''
        const hasPrev = modalIdx > 0
        const hasNext = modalIdx < checkins.length - 1
        return (
          <div onClick={() => setModalIdx(null)}
            style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.88)',
              display:'flex', alignItems:'center', justifyContent:'center', padding: isMobile ? 0 : '16px' }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background:B.surface, border:`1px solid ${B.border}`, borderRadius: isMobile ? 0 : 18,
                width:'100%', maxWidth:820, height: isMobile ? '100%' : 'auto', maxHeight: isMobile ? '100%' : '92vh',
                display:'flex', flexDirection:'column', overflow:'hidden' }}>

              {/* Modal header */}
              <div style={{ padding:'16px 20px', borderBottom:`1px solid ${B.border}`, flexShrink:0,
                display:'flex', alignItems:'flex-start', gap:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, color:B.muted, fontWeight:700, letterSpacing:1,
                    textTransform:'uppercase', marginBottom:4 }}>Weekly Check-In</div>
                  <div style={{ fontSize:17, fontWeight:800, color:B.white, marginBottom:6 }}>{dt}</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    {ci.weight && (
                      <span style={{ fontSize:13, color:B.gold, fontWeight:700 }}>⚖ {ci.weight} lbs</span>
                    )}
                    {ci.compliance != null && (
                      <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20,
                        background: ci.compliance>=90?`${B.success}22`:ci.compliance>=75?`${B.gold}22`:'#ff444422',
                        color:      ci.compliance>=90?B.success:ci.compliance>=75?B.gold:'#ff6b6b' }}>
                        {ci.compliance}% compliance
                      </span>
                    )}
                    {ci.mood && (
                      <span style={{ fontSize:11, color:B.muted }}>Mood: {ci.mood}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setModalIdx(null)}
                  style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8,
                    width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center',
                    cursor:'pointer', color:B.muted, fontSize:18, flexShrink:0 }}>×</button>
              </div>

              {/* Scrollable modal body */}
              <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>

                {/* Wellbeing score grid — big tiles */}
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:10, color:B.muted, fontWeight:700, letterSpacing:1,
                    textTransform:'uppercase', marginBottom:12 }}>Wellbeing Scores</div>
                  <div style={{ display:'grid',
                    gridTemplateColumns: isMobile ? 'repeat(4, 1fr)' : 'repeat(7, 1fr)', gap:10 }}>
                    {([
                      ['Energy',    ci.energy],
                      ['Sleep',     ci.sleep],
                      ['Bloating',  ci.bloating],
                      ['Brain Fog', ci.brainFog],
                      ['Sex Drive', ci.sexDrive],
                      ['Hunger',    ci.hunger    ? 10 - ci.hunger    : null],
                      ['Stress',    ci.stress    ? 10 - ci.stress    : null],
                    ] as [string,number|null][]).map(([l,v]) => (
                      <div key={l} style={{ background:B.card, border:`1px solid ${v!=null?`${scoreCol(v as number)}33`:B.border}`,
                        borderRadius:12, padding:'12px 8px', textAlign:'center' }}>
                        <div style={{ fontSize:9, color:B.muted, fontWeight:700, letterSpacing:0.5,
                          textTransform:'uppercase', marginBottom:6, lineHeight:1.3 }}>{l}</div>
                        {v != null
                          ? <><div style={{ fontSize:26, fontWeight:800, color:scoreCol(v), lineHeight:1 }}>{v}</div>
                              <div style={{ fontSize:9, color:B.muted, marginTop:3 }}>/ 10</div></>
                          : <div style={{ fontSize:18, color:B.border }}>—</div>
                        }
                      </div>
                    ))}
                  </div>
                </div>

                {/* Two-column layout for vitals + sleep/digestion on desktop */}
                <div style={{ display:'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:16, marginBottom:20 }}>

                  {/* Vitals */}
                  {(ci.weight || ci.temp || ci.heartRate || ci.hrv || ci.steps || ci.bloodPressure) && (
                    <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:12, padding:'14px 16px' }}>
                      <div style={{ fontSize:10, color:B.muted, fontWeight:700, letterSpacing:1,
                        textTransform:'uppercase', marginBottom:12 }}>📊 Vitals</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                        {([
                          ['⚖️ Weight',    ci.weight     ? `${ci.weight} lbs` : null],
                          ['🌡️ Temp',      ci.temp       ? `${ci.temp}°F`     : null],
                          ['❤️ Heart Rate', ci.heartRate  ? `${ci.heartRate} BPM` : null],
                          ['📡 HRV',        ci.hrv        ? `${ci.hrv}`        : null],
                          ['👟 Steps',      ci.steps      ? ci.steps           : null],
                          ['🩺 Blood Pressure', ci.bloodPressure || null],
                        ] as [string,string|null][]).filter(([,v]) => v).map(([l,v]) => (
                          <div key={l}>
                            <div style={{ fontSize:9, color:B.muted, fontWeight:700, letterSpacing:0.5,
                              textTransform:'uppercase', marginBottom:3 }}>{l}</div>
                            <div style={{ fontSize:15, fontWeight:700, color:B.white }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sleep + Digestion */}
                  {(ci.sleepWindow || ci.sleepCycles || ci.sleepDisruption || ci.bowelCount || ci.bowelType) && (
                    <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:12, padding:'14px 16px' }}>
                      {(ci.sleepWindow || ci.sleepCycles || ci.sleepDisruption) && (<>
                        <div style={{ fontSize:10, color:B.muted, fontWeight:700, letterSpacing:1,
                          textTransform:'uppercase', marginBottom:10 }}>🌙 Sleep</div>
                        <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:8 }}>
                          {ci.sleepWindow  && <div>
                            <div style={{ fontSize:9, color:B.muted, textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 }}>Window</div>
                            <div style={{ fontSize:13, color:B.white, fontWeight:600 }}>{ci.sleepWindow}</div>
                          </div>}
                          {ci.sleepCycles  && <div>
                            <div style={{ fontSize:9, color:B.muted, textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 }}>Cycles</div>
                            <div style={{ fontSize:13, color:B.white, fontWeight:600 }}>{ci.sleepCycles}</div>
                          </div>}
                        </div>
                        {ci.sleepDisruption && (
                          <div style={{ fontSize:12, color:B.muted, fontStyle:'italic',
                            background:B.surface, borderRadius:8, padding:'8px 10px',
                            marginBottom: (ci.bowelCount||ci.bowelType) ? 14 : 0 }}>
                            {ci.sleepDisruption}
                          </div>
                        )}
                      </>)}
                      {(ci.bowelCount || ci.bowelType) && (<>
                        <div style={{ fontSize:10, color:B.muted, fontWeight:700, letterSpacing:1,
                          textTransform:'uppercase', marginBottom:10,
                          marginTop: (ci.sleepWindow||ci.sleepCycles||ci.sleepDisruption) ? 14 : 0 }}>🫁 Digestion</div>
                        <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                          {ci.bowelCount && <div>
                            <div style={{ fontSize:9, color:B.muted, textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 }}>Daily BMs</div>
                            <div style={{ fontSize:15, color:B.white, fontWeight:700 }}>{ci.bowelCount}x</div>
                          </div>}
                          {ci.bowelType && <div>
                            <div style={{ fontSize:9, color:B.muted, textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 }}>Consistency</div>
                            <div style={{ fontSize:13, color:B.white, fontWeight:600 }}>{ci.bowelType}</div>
                          </div>}
                        </div>
                      </>)}
                    </div>
                  )}
                </div>

                {/* Notes + Coach feedback */}
                {ci.notes && (
                  <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:12,
                    padding:'14px 16px', marginBottom:14 }}>
                    <div style={{ fontSize:10, color:B.muted, fontWeight:700, letterSpacing:1,
                      textTransform:'uppercase', marginBottom:8 }}>Client Notes</div>
                    <div style={{ fontSize:13, color:B.text, lineHeight:1.7 }}>{ci.notes}</div>
                  </div>
                )}
                {ci.coach_notes && (
                  <div style={{ background:`${B.gold}0d`, border:`1px solid ${B.gold}44`,
                    borderLeft:`3px solid ${B.gold}`, borderRadius:12, padding:'14px 16px' }}>
                    <div style={{ fontSize:10, color:B.gold, fontWeight:700, letterSpacing:1,
                      textTransform:'uppercase', marginBottom:8 }}>💬 Coach Feedback</div>
                    <div style={{ fontSize:13, color:B.text, lineHeight:1.7 }}>{ci.coach_notes}</div>
                  </div>
                )}
              </div>

              {/* Modal footer — prev / next navigation */}
              <div style={{ borderTop:`1px solid ${B.border}`, padding:'12px 20px', flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                <button onClick={() => setModalIdx(i => i !== null && i > 0 ? i - 1 : i)}
                  disabled={!hasPrev}
                  style={{ background: hasPrev ? B.card : 'transparent',
                    border:`1px solid ${hasPrev ? B.border : 'transparent'}`,
                    borderRadius:8, padding:'8px 16px', color: hasPrev ? B.white : B.border,
                    fontSize:12, fontWeight:600, cursor: hasPrev ? 'pointer' : 'default',
                    display:'flex', alignItems:'center', gap:6 }}>
                  ← Newer
                </button>
                <div style={{ fontSize:11, color:B.muted, textAlign:'center' }}>
                  {modalIdx + 1} / {checkins.length}
                  <div style={{ fontSize:10, marginTop:1, color:B.border }}>← → to navigate · Esc to close</div>
                </div>
                <button onClick={() => setModalIdx(i => i !== null && checkins && i < checkins.length - 1 ? i + 1 : i)}
                  disabled={!hasNext}
                  style={{ background: hasNext ? B.card : 'transparent',
                    border:`1px solid ${hasNext ? B.border : 'transparent'}`,
                    borderRadius:8, padding:'8px 16px', color: hasNext ? B.white : B.border,
                    fontSize:12, fontWeight:600, cursor: hasNext ? 'pointer' : 'default',
                    display:'flex', alignItems:'center', gap:6 }}>
                  Older →
                </button>
              </div>

            </div>
          </div>
        )
      })()}

    </div>
  )
}

// ─── BOOKING / BOOK A CALL SCREEN (client sidebar item) ──────────────────────
function BookingScreen({ currentUser }: { currentUser: any }) {
  const isCoach = currentUser?.role === 'coach' || currentUser?.role === 'super_admin'
  const DEFAULT_URL = 'https://links.lifestyleofeden.com/widget/booking/2kKUGzYZqAaNBVpd5uzA'
  const [url,     setUrl]     = useState(DEFAULT_URL)
  const [editing, setEditing] = useState(false)
  const [tempUrl, setTempUrl] = useState('')
  const isMob = useIsMobile()

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:B.black, overflow:'hidden' }}>

      {/* Header */}
      <div style={{ padding: isMob ? '10px 14px' : '12px 20px', borderBottom:`1px solid ${B.border}`, flexShrink:0,
        display:'flex', alignItems:'center', flexWrap:'wrap', gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:15, fontWeight:700, color:B.white }}>📅 Book a Call</div>
          <div style={{ fontSize:11, color:B.muted, marginTop:2 }}>Schedule your next coaching session</div>
        </div>
        {isCoach && !editing && (
          <button onClick={() => { setEditing(true); setTempUrl(url) }}
            style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:8,
              padding:'7px 12px', color:B.muted, fontSize:11, cursor:'pointer', flexShrink:0 }}>
            ✏️ Update URL
          </button>
        )}
        {isCoach && editing && (
          <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap', width:'100%' }}>
            <input value={tempUrl} onChange={e => setTempUrl(e.target.value)}
              placeholder="Paste GHL or Calendly URL…"
              style={{ flex:1, minWidth:180, background:B.card, border:`1px solid ${B.border}`,
                borderRadius:8, padding:'8px 10px', color:B.white, fontSize:12, outline:'none' }}/>
            <button onClick={() => { setUrl(tempUrl.trim()); setEditing(false) }}
              style={{ background:B.gold, border:'none', borderRadius:8, padding:'8px 14px',
                fontWeight:700, color:B.black, fontSize:12, cursor:'pointer', flexShrink:0 }}>
              Save
            </button>
            <button onClick={() => setEditing(false)}
              style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8,
                padding:'8px 12px', color:B.muted, fontSize:12, cursor:'pointer', flexShrink:0 }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Iframe */}
      <div style={{ flex:1, overflow:'hidden', position:'relative' }}>
        {url ? (
          <iframe src={url} style={{ width:'100%', height:'100%', border:'none' }}
            title="Book a Call" allow="camera; microphone; autoplay; encrypted-media"/>
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
            height:'100%', flexDirection:'column', gap:12 }}>
            <div style={{ fontSize:48 }}>📅</div>
            <div style={{ fontSize:15, fontWeight:700, color:B.white }}>No booking link configured</div>
            {isCoach && <div style={{ fontSize:12, color:B.muted }}>Paste your URL above</div>}
          </div>
        )}
      </div>

      {/* Resource links */}
      <div style={{ padding:'10px 14px', borderTop:`1px solid ${B.border}`, flexShrink:0,
        display:'flex', gap:6, flexWrap:'wrap' }}>
        {[
          ['Male Blood Work Panel',   'https://shop.advancedvitalityhrt.com/?ref=LIFESTYLEOFEDEN'],
          ['Female Blood Work Panel', 'https://shop.advancedvitalityhrt.com/?ref=LIFESTYLEOFEDEN'],
          ['DUTCH Test',              'https://www.practitionerdepot.com/products/dutch-test'],
          ['GI Map',                  'https://www.practitionerdepot.com/products/gi-map'],
        ].map(([l, u]) => (
          <a key={l} href={u} target="_blank" rel="noreferrer"
            style={{ fontSize:11, color:B.gold, textDecoration:'none',
              background:`${B.gold}15`, border:`1px solid ${B.gold}33`,
              borderRadius:6, padding:'4px 10px', whiteSpace:'nowrap' }}>
            {l} →
          </a>
        ))}
      </div>
    </div>
  )
}

// ─── MAIN APP SHELL ───────────────────────────────────────────────────────────
const IDLE_MS      = 14 * 60 * 1000;  // 14 min idle → show warning
const WARNING_SECS = 60;               // 60 s to respond before forced logout

const AppShell = ({ user, onLogout, myDbas = [], onOpenDba = null }) => {
  // Change-password is only possible with a real Supabase Auth session
  // (hardcoded demo logins don't have one).
  const [hasAuthSession, setHasAuthSession] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasAuthSession(!!data?.session)).catch(()=>{});
  }, []);
  const [tab, setTab]           = useState("home");
  // White-label branding: if this user belongs to a white-label company, brand the shell as theirs
  const [wlOrg, setWlOrg] = useState<any>(null);
  useEffect(() => {
    const loadWlOrg = async () => {
      try {
        const prof = await sbGet('user_profiles', `email=eq.${encodeURIComponent((user.email||'').toLowerCase())}&select=company_id&limit=1`);
        const cid = prof?.[0]?.company_id;
        if (!cid || cid === EDEN_ORG_ID) { setWlOrg(null); return; }
        const org = await sbGet('organizations', `id=eq.${cid}&select=id,name,brand_color,logo_url,is_white_label&limit=1`);
        if (!org?.[0]?.is_white_label) { setWlOrg(null); return; }
        let row = org[0];
        // Palette column added later — fetch separately so a missing column can't break primary branding
        try {
          const pal = await sbGet('organizations', `id=eq.${cid}&select=brand_colors&limit=1`);
          if (Array.isArray(pal?.[0]?.brand_colors)) row = { ...row, brand_colors: pal[0].brand_colors };
        } catch {}
        setWlOrg(row);
      } catch { setWlOrg(null); }
    };
    loadWlOrg();
    // Re-theme instantly when branding is saved anywhere in the app (no refresh needed)
    window.addEventListener('eden:branding-updated', loadWlOrg);
    return () => window.removeEventListener('eden:branding-updated', loadWlOrg);
  }, [user.email]);
  // Full org palette (primary + secondary/accent) — falls back to Eden gold
  const wp = wlPalette(wlOrg);
  const shellPrimary   = wlOrg ? wp.primary   : B.gold;
  const shellSecondary = wlOrg ? wp.secondary : B.gold;
  const shellAccent    = wlOrg ? wp.accent    : B.gold;
  const [loomMode,     setLoomMode]     = useState(false);
  const [loomFeatured, setLoomFeatured] = useState<Set<string>>(new Set());
  const [coachClient, setCoachClient] = useState<{email:string,name:string,role:string}|null>(null);
  const [followedUp, setFollowedUp]   = useState<Set<string>>(new Set());
  const [splitView,        setSplitView]        = useState(false);
  // Split View follows the last-clicked client (from Clients list or client tools)
  const [splitClient,      setSplitClient]      = useState<{email:string,name:string,role:string}|null>(null);
  const [splitPickerOpen,  setSplitPickerOpen]  = useState(false);
  const [splitRoster,      setSplitRoster]      = useState<any[]>([]);
  const [splitRosterLoading, setSplitRosterLoading] = useState(false);
  const [leftPanel,        setLeftPanel]        = useState('checkin');
  const [rightPanel,       setRightPanel]       = useState('msgs');
  const [splitRatio,       setSplitRatio]       = useState(50);
  const [clientNavSource,  setClientNavSource]  = useState<string>('admin'); // where to go on back
  const splitDragging = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  // Helper: navigate into a client tool, remembering where we came from
  // Sidebar/menu navigation that stays useful in Split View: panel-type tabs load
  // into the left panel; anything else exits Split View and navigates normally.
  const navTab = (key: string) => {
    if (key === 'admin') setCoachClient(null);
    if (splitView) {
      if (SPLIT_PANELS.some(p => p.key === key)) { setLeftPanel(key); return; }
      setSplitView(false);
    }
    setTab(key);
  };
  const openClientTool = (dest: string, client: any, source = 'admin') => {
    setCoachClient(client);
    if (client?.email) setSplitClient({ email: client.email, name: client.name, role: client.role || 'client' });
    setTab(dest);
    setClientNavSource(source);
    // The last-clicked client is the Loom spotlight — and once clicked, their
    // name stays visible on EVERY screen until Loom Mode is switched off
    if (client?.name) { setLoomFeatured(new Set([client.name])); loomShow(client.name); }
  };
  const isMobile = useIsMobile();

  // Load the coach/admin roster when the Split View client picker opens
  useEffect(() => {
    if (!splitPickerOpen || (user.role !== 'coach' && user.role !== 'super_admin')) return;
    (async () => {
      setSplitRosterLoading(true);
      try {
        const meRows: any[] = await sbGet('user_profiles', `email=eq.${encodeURIComponent(user.email)}&select=id,company_id`);
        const me = meRows?.[0];
        if (!me) { setSplitRoster([]); return; }
        const filter = user.role === 'coach'
          ? `coach_id=eq.${me.id}`
          : `company_id=eq.${me.company_id}`;
        const rows: any[] = await sbGet('user_profiles',
          `${filter}&role=eq.client&is_active=not.is.false&select=id,name,email&order=name.asc`);
        setSplitRoster(Array.isArray(rows) ? rows : []);
      } catch { setSplitRoster([]); }
      finally { setSplitRosterLoading(false); }
    })();
  }, [splitPickerOpen, user.email, user.role]);

  // ── Inactivity auto-logout ────────────────────────────────────────
  const [idleWarning, setIdleWarning] = useState(false);
  const [countdown,   setCountdown]   = useState(WARNING_SECS);

  // All mutable state that the stable handler needs lives in refs
  const idleTimerRef   = useRef<any>(null);
  const countIntervalRef = useRef<any>(null);
  const warningActiveRef = useRef(false);   // mirrors idleWarning but readable inside callbacks
  const onLogoutRef    = useRef(onLogout);
  useEffect(() => { onLogoutRef.current = onLogout; }, [onLogout]);

  const clearAllTimers = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    clearInterval(countIntervalRef.current);
  }, []);

  const startIdleTimer = useCallback(() => {
    clearAllTimers();
    idleTimerRef.current = setTimeout(() => {
      warningActiveRef.current = true;
      setIdleWarning(true);
      setCountdown(WARNING_SECS);
      let c = WARNING_SECS;
      countIntervalRef.current = setInterval(() => {
        c -= 1;
        setCountdown(c);
        if (c <= 0) {
          clearAllTimers();
          onLogoutRef.current();
        }
      }, 1000);
    }, IDLE_MS);
  }, [clearAllTimers]);

  // Stable event handler — created once, ref-based reads so no stale closure
  const activityHandler = useRef(() => {
    if (warningActiveRef.current) return;  // ignore activity while warning is showing
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      warningActiveRef.current = true;
      setIdleWarning(true);
      setCountdown(WARNING_SECS);
      let c = WARNING_SECS;
      countIntervalRef.current = setInterval(() => {
        c -= 1;
        setCountdown(c);
        if (c <= 0) {
          clearInterval(countIntervalRef.current);
          onLogoutRef.current();
        }
      }, 1000);
    }, IDLE_MS);
  });

  const stayLoggedIn = useCallback(() => {
    clearAllTimers();
    warningActiveRef.current = false;
    setIdleWarning(false);
    startIdleTimer();
  }, [clearAllTimers, startIdleTimer]);

  // Mount once — stable handler reference, never needs to be re-registered
  useEffect(() => {
    const events = ["mousemove","mousedown","keydown","touchstart","scroll","click"];
    const handler = activityHandler.current;
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    startIdleTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      clearAllTimers();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [menuOpen, setMenuOpen] = useState(false);

  // ── Learn tab gating for white-label orgs ──
  // Eden users always get Learn. White-label users only get it when their org's
  // tier (packages row matching organizations.plan) has includes_courses=true.
  // null = still resolving → hide Learn to avoid flashing it for gated orgs.
  const [learnAllowed, setLearnAllowed] = useState<boolean|null>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const me = await sbGet('user_profiles', `email=eq.${encodeURIComponent(user.email)}&select=company_id`);
        const cid = me?.[0]?.company_id;
        if (!cid || cid === EDEN_ORG_ID) { if (!dead) setLearnAllowed(true); return; }
        const org = (await sbGet('organizations', `id=eq.${cid}&select=plan,is_white_label&limit=1`))?.[0];
        if (!org || org.is_white_label !== true) { if (!dead) setLearnAllowed(true); return; }
        const pkg = (await sbGet('packages', `name=ilike.${encodeURIComponent(org.plan||'')}&select=includes_courses&limit=1`))?.[0];
        if (!dead) setLearnAllowed(!!pkg?.includes_courses);
      } catch { if (!dead) setLearnAllowed(true); } // fail open for Eden-side glitches
    })();
    return () => { dead = true; };
  }, [user.email]);

  const clientTabs = [
    { key:"home",      icon:"home",      label:"Home" },
    { key:"msgs",      icon:"msg",       label:"Messages" },
    { key:"diet",      icon:"diet",      label:"Diet" },
    { key:"checkin",   icon:"checkin",   label:"Check In" },
    { key:"labs",      icon:"labs",      label:"Labs" },
    { key:"workout",   icon:"workout",   label:"Workout" },
    { key:"wearables", icon:"watch",     label:"Wearables" },
    { key:"calendar",  icon:"calendar",  label:"Book a Call" },
    { key:"learn",     icon:"learn",     label:"Learn" },
    { key:"community", icon:"community", label:"Connect" },
  ];
  const coachTabs = [
    { key:"home",      icon:"home",      label:"Home" },
    { key:"msgs",      icon:"msg",       label:"Messages" },
    { key:"admin",     icon:"admin",     label:"Clients" },
    { key:"team",      icon:"team",      label:"Team Hub" },
    { key:"learn",     icon:"learn",     label:"Learn" },
    { key:"community", icon:"community", label:"Connect" },
  ];
  const adminTabs = [
    { key:"home",      icon:"home",      label:"Home" },
    { key:"msgs",      icon:"msg",       label:"Messages" },
    { key:"admin",     icon:"admin",     label:"Admin" },
    { key:"team",      icon:"team",      label:"Team Hub" },
    { key:"learn",     icon:"learn",     label:"Learn" },
    { key:"community", icon:"community", label:"Connect" },
  ];

  // Staff roles (VA, head coach, etc.) — 2 tabs: their client view + messages
  const isStaff = !["super_admin","coach","client"].includes(user.role);
  const staffTabs = [
    { key:"home", icon:"home", label:"My Clients" },
    { key:"msgs", icon:"msg",  label:"Messages"   },
    { key:"team", icon:"team", label:"Team Hub"   },
  ];

  // Offboarded clients with community-only access: Messages/Communities is all they get
  const communityOnly = (user as any).communityOnly === true;
  const baseTabs = communityOnly ? [{ key:"msgs", icon:"msg", label:"Messages" }]
             : user.role === "super_admin" ? adminTabs
             : user.role === "coach"       ? coachTabs
             : isStaff                     ? staffTabs
             : clientTabs;
  const tabs = baseTabs.filter(t => t.key !== "learn" || learnAllowed === true);
  useEffect(() => { if (communityOnly && tab !== "msgs") setTab("msgs"); }, [communityOnly, tab]);

  // Manual per-staff access control — admin_settings key staff_meta:<profileId>
  // holds {label, tabs:['home','msgs','team']}. When set, staff only see those tabs.
  const [staffAllowedTabs, setStaffAllowedTabs] = useState<string[]|null>(null);
  useEffect(() => {
    if (!isStaff) { setStaffAllowedTabs(null); return; }
    (async () => {
      try {
        const rows: any[] = await sbGet('user_profiles', `email=eq.${encodeURIComponent(user.email)}&select=id`);
        const id = rows?.[0]?.id;
        if (!id) return;
        const s: any[] = await sbGet('admin_settings', `key=eq.${encodeURIComponent('staff_meta:'+id)}&select=value`);
        const v = s?.[0]?.value;
        if (!v) return;
        const meta = typeof v === 'string' ? JSON.parse(v) : v;
        if (Array.isArray(meta?.tabs) && meta.tabs.length) setStaffAllowedTabs(meta.tabs);
      } catch {}
    })();
  }, [isStaff, user.email]);
  const visibleTabs = (isStaff && staffAllowedTabs) ? tabs.filter(t => staffAllowedTabs.includes(t.key)) : tabs;

  // Team Hub chat unread dot — lights up on the sidebar tab when #general or a DM
  // has messages newer than last viewed (tracked in localStorage by Week7).
  const teamHubUnread = useTeamHubUnread(user);
  useEffect(() => {
    if (isStaff && staffAllowedTabs && !staffAllowedTabs.includes(tab) && visibleTabs.length) setTab(visibleTabs[0].key);
  }, [isStaff, staffAllowedTabs, tab]); // eslint-disable-line

  // Safety net: if someone is sitting on Learn when the tier gate resolves to
  // "not included" (or lands there via any stray navigation), bounce them home.
  useEffect(() => {
    if (tab === "learn" && learnAllowed === false) setTab("home");
  }, [tab, learnAllowed]);

  const SPLIT_PANELS = [
    { key:'msgs',    label:'Messages',  icon:'chat' },
    { key:'checkin', label:'Check-in',  icon:'assignment' },
    { key:'diet',    label:'Diet',      icon:'restaurant' },
    { key:'workout', label:'Program',   icon:'fitness_center' },
    { key:'labs',    label:'Labs',      icon:'biotech' },
  ];

  const renderPanel = (panelTab: string) => {
    // Split View always follows the last-clicked client (splitClient), not the stale tool client
    const toolUser = (user.role === 'coach' || user.role === 'super_admin') && splitClient
      ? { ...splitClient, role: user.role }
      : { email: user.email, name: user.name, role: user.role };
    const ciEmail = ((user.role === 'coach' || user.role === 'super_admin') && splitClient)
      ? splitClient.email : user.email;
    const ciDemoCheckins: any[] = [];
    if (panelTab === 'msgs')    return <Messaging currentUser={{ email: user.email, name: user.name, role: user.role }} loomMode={loomMode} loomFeatured={loomFeatured}/>;
    if (panelTab === 'diet')    return <DietBuilder key="diet"    currentUser={toolUser} demoCheckins={ciDemoCheckins}/>;
    if (panelTab === 'checkin') return <DietBuilder key="checkin" currentUser={toolUser} initialTab="checkin" demoCheckins={ciDemoCheckins}/>;
    if (panelTab === 'workout') return <Week4 key="workout" currentUser={toolUser} initialTab="workout"/>;
    if (panelTab === 'labs')    return <Week4 key="labs"    currentUser={toolUser} initialTab="labs"/>;
    return null;
  };

  const PanelPicker = ({ value, onChange }: { value: string; onChange: (v:string) => void }) => (
    <div style={{ display:'flex', alignItems:'center', gap:2, padding:'6px 10px', background:B.surface, borderBottom:`1px solid ${B.border}`, flexShrink:0, overflowX:'auto' }}>
      {SPLIT_PANELS.map(p => (
        <button key={p.key} onClick={() => onChange(p.key)}
          style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:6, border:'none',
            background: value===p.key ? `${B.gold}22` : 'transparent',
            borderBottom: value===p.key ? `2px solid ${B.gold}` : '2px solid transparent',
            cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
          <Ic n={p.icon} size={13} c={value===p.key ? B.gold : B.muted}/>
          <span style={{ fontSize:11, fontWeight: value===p.key ? 700 : 400, color: value===p.key ? B.gold : B.muted }}>{p.label}</span>
        </button>
      ))}
    </div>
  );

  const handleSplitDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    splitDragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!splitDragging.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const ratio = Math.min(75, Math.max(25, ((ev.clientX - rect.left) / rect.width) * 100));
      setSplitRatio(ratio);
    };
    const onUp = () => { splitDragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const renderScreen = () => {
    // Super admin
    if (user.role === "super_admin") {
      if (tab === "home") return <AdminDashboard user={user}/>;
    }
    // Coach
    if (user.role === "coach") {
      if (tab === "home") return <CoachDashboard user={user} onNavigate={(dest:string, client?:any) => openClientTool(dest, client, 'home')} loomMode={loomMode} setLoomMode={setLoomMode} loomFeatured={loomFeatured} followedUp={followedUp} setFollowedUp={setFollowedUp}/>;
    }
    // Staff (VA, head coach, etc.)
    if (isStaff) {
      if (tab === "home") return <StaffClientPanel user={user}/>;
      if (tab === "msgs") return <Messaging currentUser={{ email: user.email, name: user.name, role: user.role }} loomMode={loomMode} loomFeatured={loomFeatured}/>;
      if (tab === "team") return <Week7 currentUser={{ email: user.email, name: user.name, role: user.role }}/>;
      return <StaffClientPanel user={user}/>;
    }
    // Shared screens
    if (tab === "home")      return <HomeScreen user={user} wlOrg={wlOrg}/>;
    if (tab === "msgs")      return <Messaging currentUser={{ email: user.email, name: user.name, role: user.role }} loomMode={loomMode} loomFeatured={loomFeatured} initialConvoName={coachClient?.name}/>;
    // When a coach navigates into a client tool, pass the client's email/name for
    // data context but keep the coach's role so components show the editable coach view
    const toolUser = (user.role === "coach" || user.role === "super_admin") && coachClient
      ? { ...coachClient, role: user.role }
      : { email: user.email, name: user.name, role: user.role };
    const ciDemoCheckins: any[] = [];
    const onBack = coachClient ? () => { setTab(clientNavSource); } : undefined;
    if (tab === "diet")         return <DietBuilder key="diet" currentUser={toolUser} demoCheckins={ciDemoCheckins} onBack={onBack}/>;
    if (tab === "supplements")  return <DietBuilder key="supplements" currentUser={toolUser} initialTab="supplements" demoCheckins={ciDemoCheckins} onBack={onBack}/>;
    if (tab === "calendar")     return <BookingScreen currentUser={toolUser}/>;
    if (tab === "labs")         return <Week4 key="labs" currentUser={toolUser} initialTab="labs" onBack={onBack}/>;
    if (tab === "checkin")      return <DietBuilder key="checkin" currentUser={toolUser} initialTab="checkin" demoCheckins={ciDemoCheckins} onBack={onBack}/>;
    if (tab === "habits")       return <HabitTrackerScreen/>;
    if (tab === "workout")      return <Week4 currentUser={toolUser} initialTab="workout" onBack={onBack}/>;
    if (tab === "admin")     return <Week6 currentUser={{ email: user.email, name: user.name, role: user.role }}
                                          onNavigate={(dest:string, client:any) => { setCoachClient(client); setTab(dest); }}
                                          initialClient={coachClient}
                                          loomMode={loomMode}
                                          loomFeatured={loomFeatured}
                                          setLoomFeatured={setLoomFeatured}
                                          onClientFocus={(c:any) => setSplitClient(c)}/>;
    if (tab === "wearables") return <Wearables currentUser={toolUser}/>;
    if (tab === "team")      return <Week7 currentUser={{ email: user.email, name: user.name, role: user.role }} initialDm={coachClient}/>;
    if (tab === "learn")     return learnAllowed === true ? <Week5 currentUser={{ email: user.email, name: user.name, role: user.role }}/> : null;
    if (tab === "community") return <CommunityScreen user={user}/>;
    return <HomeScreen user={user} wlOrg={wlOrg}/>;
  };

  return (
    <HuddleProvider currentUser={{ email: user.email, name: user.name, role: user.role }}>
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", width:"100%", background:B.black, overflow:"hidden" }}>
      {/* Top bar */}
      <div style={{ background:B.surface, borderBottom:`1px solid ${B.border}`, padding:"8px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {/* Hamburger menu — mobile only */}
          {isMobile && (
            <button onClick={() => setMenuOpen(v => !v)} aria-label="Menu"
              style={{ background: menuOpen ? `${B.gold}22` : "none", border:`1.5px solid ${menuOpen ? B.gold : B.border}`,
                borderRadius:8, padding:"6px 9px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:17, lineHeight:1, color: menuOpen ? B.gold : B.text }}>☰</span>
            </button>
          )}
          {wlOrg ? <OrgLogo org={wlOrg} size={30}/> : <HoneycombLogo size={30}/>}
          <div>
            <p style={{ fontSize:13, fontWeight:700, color:B.text, margin:0 }}>{wlOrg ? wlOrg.name : "Eden Communications"}</p>
            {!isMobile && <p style={{ fontSize:9, color:B.muted, margin:0, letterSpacing:0.5 }}>{wlOrg ? "🔒 Encrypted" : "🔒 Encrypted · edencommunications.io"}</p>}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:isMobile?8:12 }}>
          {/* Switch into a DBA space — shown to coaches/admins/delegates with DBA access */}
          {myDbas.length > 0 && onOpenDba && (
            <button onClick={onOpenDba}
              title={myDbas.length === 1 ? `Switch to ${myDbas[0]?.name}` : "Switch to one of your DBA spaces"}
              style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2,
                background:"transparent", border:`1.5px solid ${B.border}`,
                borderRadius:8, padding:"4px 8px", cursor:"pointer" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={B.text} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/>
              </svg>
              <span style={{ fontSize:8, fontWeight:700, letterSpacing:.6, textTransform:"uppercase", color:B.muted }}>
                {myDbas.length === 1 ? "DBA" : "DBAs"}
              </span>
            </button>
          )}
          {/* Split View toggle — coach/admin */}
          {(user.role === "coach" || user.role === "super_admin") && (
            <button onClick={() => setSplitView(v => {
                const next = !v;
                // Entering Split View with no client picked yet → ask which client
                if (next && !splitClient) setSplitPickerOpen(true);
                if (!next) setSplitPickerOpen(false);
                return next;
              })}
              title={splitView ? "Exit Split View" : "Split View — see two panels side by side"}
              style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2,
                background: splitView ? `${B.gold}22` : "transparent",
                border:`1.5px solid ${splitView ? B.gold : B.border}`,
                borderRadius:8, padding:"4px 8px", cursor:"pointer" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={splitView ? B.gold : B.text} strokeWidth="2.2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/>
              </svg>
              <span style={{ fontSize:8, fontWeight:700, letterSpacing:.6, textTransform:"uppercase",
                color: splitView ? B.gold : B.muted }}>
                {splitView ? "Split ON" : "Split"}
              </span>
            </button>
          )}
          {/* Loom Mode toggle — coaches AND admins, persists across all tabs */}
          {(user.role === "coach" || user.role === "super_admin") && (
            <button onClick={() => setLoomMode(v => {
                const on = !v;
                // If a client tool screen is open, they're the spotlight; otherwise keep
                // the last-clicked client (set by the Clients list / dashboard)
                if (on && coachClient?.name) setLoomFeatured(new Set([coachClient.name]));
                // Global flag for admin screens: <LN> wrappers blur names when this is on
                loomSet(on);
                return on;
              })}
              title={loomMode ? "Exit Loom Mode" : "Enable Loom Mode — hides other client names"}
              style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2,
                background: loomMode ? "#ff525222" : "transparent",
                border:`1.5px solid ${loomMode ? "#ff5252" : B.border}`,
                borderRadius:8, padding:"4px 8px", cursor:"pointer" }}>
              <span style={{ fontSize:15 }}>{loomMode ? "🔴" : "🎥"}</span>
              {!isMobile && (
                <span style={{ fontSize:8, fontWeight:700, letterSpacing:.6, textTransform:"uppercase",
                  color: loomMode ? "#ff5252" : B.muted }}>
                  {loomMode ? "Loom ON" : "Loom"}
                </span>
              )}
            </button>
          )}
          {(user.role === "coach" || user.role === "super_admin") && <LoomPicker isMobile={isMobile}/>}
          <DndButton isMobile={isMobile}/>
          <Notifications currentUser={{ email: user.email, name: user.name, role: user.role }} onNavigate={(dest: string, client?: any) => {
            // Deep-link: check-in notifications carry the submitting client, so
            // coaches land in the Check-In Hub with that client pre-selected.
            if (client?.email && (user.role === 'coach' || user.role === 'super_admin')) openClientTool(dest, client, tab);
            else navTab(dest);
          }}/>
          {hasAuthSession && (
            <button onClick={() => setShowChangePw(true)} title="Change password"
              style={{ background:"none", border:`1px solid ${B.border}`, borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", gap:5, padding:"5px 10px" }}>
              <Ic n="lock" size={14} c={B.muted}/>
              {!isMobile && <span style={{ fontSize:11, color:B.muted }}>Password</span>}
            </button>
          )}
          <div style={{ width:30, height:30, borderRadius:15, background:`linear-gradient(135deg, ${shellPrimary}, ${shellSecondary})`, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:13, fontWeight:800, color:B.black }}>{user.name[0]}</span>
          </div>
          <button onClick={onLogout} style={{ background:"none", border:`1px solid ${B.border}`, borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", gap:5, padding:"5px 10px" }}>
            <Ic n="logout" size={14} c={B.muted}/>
            {!isMobile && <span style={{ fontSize:11, color:B.muted }}>Sign out</span>}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {isMobile && menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)}
            style={{ position:"fixed", inset:0, zIndex:998, background:"rgba(0,0,0,0.6)" }}/>
          <div style={{ position:"absolute", top:54, left:8, zIndex:999, width:230,
            background:B.surface, border:`1px solid ${B.border}`, borderRadius:14,
            boxShadow:"0 12px 40px rgba(0,0,0,0.7)", overflow:"hidden", paddingBottom:6 }}>
            <div style={{ padding:"12px 16px 10px", borderBottom:`1px solid ${B.border}`, marginBottom:4 }}>
              <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, margin:0, textTransform:"uppercase" }}>
                {(user.email || "").toLowerCase() === OWNER_EMAIL ? "Owner" : user.role === "super_admin" ? "Super Admin" : user.role === "coach" ? "Coach Portal" : "My Dashboard"}
              </p>
              <p style={{ fontSize:13, color:shellSecondary, margin:"3px 0 0", fontWeight:600 }}>{user.name}</p>
            </div>
            {visibleTabs.map((t, ti) => {
              // White-label orgs: tabs use the single primary brand color
              const tc = shellPrimary;
              return (
              <button key={t.key}
                onClick={() => { navTab(t.key); setMenuOpen(false); }}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 16px",
                  background:tab===t.key?`${tc}15`:"none", border:"none",
                  borderLeft:`3px solid ${tab===t.key?tc:"transparent"}`,
                  cursor:"pointer", textAlign:"left", width:"100%" }}>
                <Ic n={t.icon} size={19} c={tab===t.key?tc:B.muted}/>
                <span style={{ fontSize:14, fontWeight:tab===t.key?700:500, color:tab===t.key?tc:B.text }}>{t.label}</span>
                {t.key==="team" && teamHubUnread && tab!=="team" && (
                  <span style={{ width:8, height:8, borderRadius:4, background:shellPrimary, marginLeft:"auto", flexShrink:0 }}/>
                )}
              </button>
            );})}
          </div>
        </>
      )}

      {/* Body */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"row" }}>

        {/* Sidebar — desktop only */}
        {!isMobile && (
          <div style={{ width:200, background:B.surface, borderRight:`1px solid ${B.border}`, flexShrink:0, display:"flex", flexDirection:"column", padding:"12px 0" }}>
            <div style={{ padding:"0 14px 16px", borderBottom:`1px solid ${B.border}`, marginBottom:8 }}>
              <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, margin:0, textTransform:"uppercase" }}>
                {(user.email || "").toLowerCase() === OWNER_EMAIL ? "Owner" : user.role === "super_admin" ? "Super Admin" : user.role === "coach" ? "Coach Portal" : "My Dashboard"}
              </p>
              <p style={{ fontSize:12, color:shellSecondary, margin:"3px 0 0", fontWeight:600 }}>{user.name}</p>
            </div>
            {visibleTabs.map((t, ti) => {
              // White-label orgs: tabs use the single primary brand color
              const tc = shellPrimary;
              return (
              <button key={t.key} onClick={() => navTab(t.key)}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:tab===t.key?`${tc}15`:"none", border:"none", borderLeft:`3px solid ${tab===t.key?tc:"transparent"}`, cursor:"pointer", textAlign:"left", width:"100%" }}>
                <Ic n={t.icon} size={17} c={tab===t.key?tc:B.muted}/>
                <span style={{ fontSize:13, fontWeight:tab===t.key?700:400, color:tab===t.key?tc:B.muted }}>{t.label}</span>
                {t.key==="team" && teamHubUnread && tab!=="team" && (
                  <span style={{ width:8, height:8, borderRadius:4, background:shellPrimary, marginLeft:"auto", flexShrink:0 }}/>
                )}
              </button>
            );})}
            <div style={{ marginTop:"auto", padding:"12px 14px", borderTop:`1px solid ${B.border}` }}>
              <div style={{ padding:"8px 10px", background: wlOrg ? `linear-gradient(135deg, ${shellPrimary}18, ${shellSecondary}18)` : B.goldDim, border:`1px solid ${wlOrg ? `${shellAccent}44` : B.goldMid}`, borderRadius:8 }}>
                <p style={{ fontSize:9, color: shellPrimary, margin:0, fontWeight:700, letterSpacing:0.8, textTransform:"uppercase" }}>{wlOrg ? wlOrg.name : "LIFESTYLE OF EDEN"}</p>
                {!wlOrg && <p style={{ fontSize:10, color:B.muted, margin:"2px 0 0" }}>Powered by Eden Comms</p>}
                {wlOrg && wp.extra.length > 0 && (
                  <div style={{ display:"flex", gap:4, marginTop:5 }}>
                    {wp.all.slice(0,6).map((c,i)=>(
                      <span key={i} style={{ width:10, height:10, borderRadius:5, background:c, display:"inline-block", border:"1px solid #00000055" }}/>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}


        {/* Main content area */}
        <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", background:B.black }}>
          {splitView ? (
            <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden', height:'100%' }}>
            {/* Split View client bar — shows whose data both panels display */}
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 14px', background:B.surface,
              borderBottom:`1px solid ${B.border}`, flexShrink:0 }}>
              <span style={{ fontSize:11, color:B.muted, fontWeight:700, letterSpacing:.5, textTransform:'uppercase' }}>Client:</span>
              <span style={{ fontSize:13, fontWeight:800, color:B.gold }}>{splitClient?.name || 'None selected'}</span>
              <button onClick={() => setSplitPickerOpen(true)}
                style={{ marginLeft:4, fontSize:11, fontWeight:700, color:B.text, background:'transparent',
                  border:`1px solid ${B.border}`, borderRadius:6, padding:'3px 10px', cursor:'pointer' }}>
                Change client
              </button>
            </div>
            {/* Client picker overlay */}
            {splitPickerOpen && (
              <div style={{ position:'fixed', inset:0, zIndex:9000, background:'rgba(0,0,0,0.75)',
                display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
                <div style={{ background:B.surface, border:`1px solid ${B.border}`, borderRadius:16,
                  padding:'22px 20px', maxWidth:380, width:'100%', maxHeight:'70vh', display:'flex', flexDirection:'column' }}>
                  <h3 style={{ fontSize:15, fontWeight:800, color:B.text, margin:'0 0 4px' }}>Choose a client for Split View</h3>
                  <p style={{ fontSize:12, color:B.muted, margin:'0 0 14px' }}>Both panels will show this client's info.</p>
                  <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:6 }}>
                    {splitRosterLoading && <p style={{ fontSize:12, color:B.muted }}>Loading clients…</p>}
                    {!splitRosterLoading && splitRoster.length === 0 && <p style={{ fontSize:12, color:B.muted }}>No active clients found.</p>}
                    {!splitRosterLoading && splitRoster.map((c:any) => (
                      <button key={c.id}
                        onClick={() => { setSplitClient({ email:c.email, name:c.name, role:'client' }); setSplitPickerOpen(false); }}
                        style={{ textAlign:'left', padding:'10px 12px', borderRadius:8, cursor:'pointer',
                          background: splitClient?.email === c.email ? `${B.gold}22` : B.black,
                          border:`1px solid ${splitClient?.email === c.email ? B.gold : B.border}`,
                          fontSize:13, fontWeight:600, color:B.text }}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { setSplitPickerOpen(false); if (!splitClient) setSplitView(false); }}
                    style={{ marginTop:14, padding:'8px 0', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:700,
                      background:'transparent', border:`1px solid ${B.border}`, color:B.muted }}>
                    {splitClient ? 'Cancel' : 'Cancel & exit Split View'}
                  </button>
                </div>
              </div>
            )}
            {isMobile ? (
              /* Mobile split view — two panels stacked vertically */
              <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden', height:'100%' }}>
                <div style={{ height:'50%', display:'flex', flexDirection:'column', overflow:'hidden', borderBottom:`2px solid ${B.gold}55` }}>
                  <PanelPicker value={leftPanel} onChange={setLeftPanel}/>
                  <div style={{ flex:1, overflow:'hidden' }}>{renderPanel(leftPanel)}</div>
                </div>
                <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
                  <PanelPicker value={rightPanel} onChange={setRightPanel}/>
                  <div style={{ flex:1, overflow:'hidden' }}>{renderPanel(rightPanel)}</div>
                </div>
              </div>
            ) : (
            <div ref={splitContainerRef} style={{ display:'flex', flex:1, overflow:'hidden', height:'100%' }}>
              {/* Left panel */}
              <div style={{ width:`${splitRatio}%`, display:'flex', flexDirection:'column', overflow:'hidden', borderRight:`1px solid ${B.border}` }}>
                <PanelPicker value={leftPanel} onChange={setLeftPanel}/>
                <div style={{ flex:1, overflow:'hidden' }}>{renderPanel(leftPanel)}</div>
              </div>
              {/* Drag divider */}
              <div onMouseDown={handleSplitDividerMouseDown}
                style={{ width:5, background:B.border, cursor:'col-resize', flexShrink:0, transition:'background 0.15s' }}
                onMouseEnter={e=>(e.currentTarget.style.background=B.gold)}
                onMouseLeave={e=>(e.currentTarget.style.background=B.border)}/>
              {/* Right panel */}
              <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
                <PanelPicker value={rightPanel} onChange={setRightPanel}/>
                <div style={{ flex:1, overflow:'hidden' }}>{renderPanel(rightPanel)}</div>
              </div>
            </div>
            )}
            </div>
          ) : renderScreen()}
        </div>
      </div>


      {/* ── HIPAA inactivity warning overlay ────────────────────────── */}
      {idleWarning && (
        <div style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,0.85)",
          display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div style={{ background:B.surface, border:`1px solid ${B.border}`, borderRadius:18,
            padding:"32px 28px", maxWidth:340, width:"100%", textAlign:"center", boxShadow:"0 8px 40px #000a" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
            <h2 style={{ fontSize:18, fontWeight:800, color:B.text, margin:"0 0 8px" }}>
              Still there?
            </h2>
            <p style={{ fontSize:13, color:B.muted, margin:"0 0 20px", lineHeight:1.6 }}>
              For your security, you'll be signed out automatically due to inactivity.
            </p>
            {/* Countdown ring */}
            <div style={{ fontSize:36, fontWeight:900,
              color: countdown <= 15 ? "#ff5252" : countdown <= 30 ? B.gold : B.text,
              marginBottom:20, fontVariantNumeric:"tabular-nums" }}>
              {countdown}s
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <button onClick={stayLoggedIn}
                style={{ background:B.gold, border:"none", borderRadius:10, padding:"13px 0",
                  fontWeight:800, fontSize:14, color:B.black, cursor:"pointer", width:"100%" }}>
                Stay Signed In
              </button>
              <button onClick={() => { clearAllTimers(); onLogout(); }}
                style={{ background:"none", border:`1px solid ${B.border}`, borderRadius:10,
                  padding:"11px 0", fontWeight:600, fontSize:13, color:B.muted, cursor:"pointer", width:"100%" }}>
                Sign Out Now
              </button>
            </div>
          </div>
        </div>
      )}
      {showChangePw && <ChangePasswordModal onClose={()=>setShowChangePw(false)}/>}
    </div>
    </HuddleProvider>
  );
};

// ─── DBA (sub-brand) member space ───────────────────────────────────────────
// DBA members don't see the main app — they land in a branded DBA shell with
// only: Home, Connect (per-DBA links) and Learn (per-DBA courses). The DBA's
// coach and the org admin see the same shell with inline manage controls, so
// they can preview exactly what members see. Communities/Huddles/Calendar
// tabs arrive in later phases.
const DBA_API = (p: string) => `${(import.meta.env.BASE_URL || '/')}api/dba/${p}`;

// Connect tab — member view + manager editing of the per-DBA link list
const DbaConnect = ({ primary, content, saveConnect, busy, dba }: any) => {
  const canManage = content?.can_manage;
  const links = content?.connect || [];
  const isMobile = useIsMobile();
  // Cycle through the DBA's full palette so multi-color brands look multi-color
  const palette = useMemo(() => {
    const extras = Array.isArray(dba?.brand_colors) ? dba.brand_colors.filter((c: string) => /^#[0-9a-f]{6}$/i.test(String(c || ""))) : [];
    return [primary, ...extras];
  }, [dba?.brand_colors, primary]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any[]>([]);
  const startEdit = () => { setDraft(links.map((l: any) => ({ ...l }))); setEditing(true); };
  const setD = (i: number, k: string, v: string) => setDraft(p => p.map((l, j) => j === i ? { ...l, [k]: v } : l));
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: B.text, margin: 0 }}>Connect</h2>
        {canManage && !editing && (
          <button onClick={startEdit} style={{ background: "none", color: primary, border: `1px solid ${primary}55`, borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✎ Edit links</button>
        )}
      </div>
      {!editing && links.length === 0 && (
        <Card><p style={{ fontSize: 13, color: B.muted, margin: 0, lineHeight: 1.7 }}>
          {canManage ? "No links yet — add your community, socials, booking page or anything members should reach fast." : "Nothing here yet — links from your coach will appear here."}
        </p></Card>
      )}
      {!editing && links.length > 0 && (
        <>
          <div style={{ textAlign: "center", background: `linear-gradient(160deg, ${primary}1c 0%, ${B.surface} 100%)`, border: `1px solid ${B.border}`, borderRadius: 16, padding: "26px 20px", marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: primary, letterSpacing: 1.4, textTransform: "uppercase", margin: "0 0 6px" }}>{dba?.name || "Connect"}</p>
            <h3 style={{ fontSize: 19, fontWeight: 800, color: B.text, margin: 0 }}>Stay connected</h3>
            <p style={{ fontSize: 12, color: B.muted, margin: "6px 0 0", lineHeight: 1.6 }}>Community, socials and everything worth bookmarking — all in one place.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            {links.map((l: any, i: number) => {
              const accent = palette[i % palette.length] || primary;
              return (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block" }}>
                  <div style={{ height: "100%", boxSizing: "border-box", background: `linear-gradient(150deg, ${accent}16 0%, ${B.card} 70%)`, border: `1px solid ${accent}44`, borderRadius: 14, padding: "16px" }}>
                    {l.emoji && <span style={{ fontSize: 22, display: "block", marginBottom: 8 }}>{l.emoji}</span>}
                    <p style={{ fontSize: 14, fontWeight: 800, color: B.text, margin: 0 }}>{l.title}</p>
                    {l.desc && <p style={{ fontSize: 12, color: B.muted, margin: "4px 0 0", lineHeight: 1.5 }}>{l.desc}</p>}
                    <p style={{ fontSize: 11, fontWeight: 800, color: accent, margin: "10px 0 0" }}>Open →</p>
                  </div>
                </a>
              );
            })}
          </div>
        </>
      )}
      {editing && (
        <Card>
          {draft.map((l, i) => (
            <div key={l.id || i} style={{ borderBottom: `1px solid ${B.border}`, paddingBottom: 10, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <input value={l.emoji || ""} onChange={e => setD(i, "emoji", e.target.value)} placeholder="📸"
                  maxLength={4} title="Emoji shown on the card (optional)"
                  style={{ width: 46, textAlign: "center", background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 4px", color: B.text, fontSize: 14, outline: "none" }} />
                <input value={l.title} onChange={e => setD(i, "title", e.target.value)} placeholder="Title (e.g. Our Instagram)"
                  style={{ flex: 1, minWidth: 140, background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 10px", color: B.text, fontSize: 12, outline: "none" }} />
                <button onClick={() => setDraft(p => p.filter((_, j) => j !== i))}
                  style={{ background: "none", color: "#e05a5a", border: `1px solid ${B.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, cursor: "pointer" }}>Remove</button>
              </div>
              <input value={l.url} onChange={e => setD(i, "url", e.target.value)} placeholder="https://…"
                style={{ width: "100%", boxSizing: "border-box", background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 10px", color: B.text, fontSize: 12, outline: "none", marginBottom: 6, fontFamily: "monospace" }} />
              <input value={l.desc || ""} onChange={e => setD(i, "desc", e.target.value)} placeholder="Short description (optional)"
                style={{ width: "100%", boxSizing: "border-box", background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 10px", color: B.text, fontSize: 12, outline: "none" }} />
            </div>
          ))}
          <button onClick={() => setDraft(p => [...p, { id: "", emoji: "", title: "", url: "", desc: "" }])}
            style={{ background: "none", color: primary, border: `1px dashed ${primary}66`, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", width: "100%", marginBottom: 10 }}>+ Add link</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={busy} onClick={async () => { if (await saveConnect(draft)) setEditing(false); }}
              style={{ background: primary, color: "#000", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save"}</button>
            <button onClick={() => setEditing(false)} style={{ background: "none", color: B.muted, border: `1px solid ${B.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
          </div>
          <p style={{ fontSize: 10, color: B.muted, margin: "8px 0 0" }}>Links must start with http:// or https://. Rows without a valid link are dropped on save.</p>
        </Card>
      )}
    </div>
  );
};

// Turn common share links into embeddable player URLs (mirrors the main
// course builder's behavior so pasted YouTube/Vimeo/Loom links just work)
const dbaToEmbed = (raw: string) => {
  const u = String(raw || "").trim();
  let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/i);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = u.match(/vimeo\.com\/(\d+)/i);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  m = u.match(/loom\.com\/share\/([\w-]+)/i);
  if (m) return `https://www.loom.com/embed/${m[1]}`;
  m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/i);
  if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  return u;
};

// Learn tab — assigned courses; viewer with progress + manager course builder
const DbaLearn = ({ primary, palette = null, content, dba, saveLearn, markLesson, busy, saveCourse, saveLesson, deleteLesson }: any) => {
  // Course cards always use the brand's primary color — no palette cycling
  const courseColor = (_i: number) => primary;
  const canManage = content?.can_manage;
  const courses = content?.courses || [];
  const completed: Set<string> = useMemo(() => new Set(content?.completed || []), [content?.completed]);
  const [openCourse, setOpenCourse] = useState<any>(null);
  const [openLesson, setOpenLesson] = useState<any>(null);
  const [assigning, setAssigning] = useState(false);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  // Builder state (managers only)
  const [creating, setCreating] = useState(false);
  const [cTitle, setCTitle] = useState(""); const [cDesc, setCDesc] = useState(""); const [cSeq, setCSeq] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [lForm, setLForm] = useState<any>(null); // {lessonId?, sectionTitle, title, duration, videoUrl, notes}
  const inp = { width: "100%", boxSizing: "border-box" as const, background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 10px", color: B.text, fontSize: 12, outline: "none", marginBottom: 6 };
  const course = openCourse ? courses.find((c: any) => c.id === openCourse) : null;
  useEffect(() => { if (openCourse && !course) { setOpenCourse(null); setOpenLesson(null); } }, [openCourse, course]);
  const sections = useMemo(() => {
    if (!course) return [];
    const by: any[] = [];
    for (const m of course.modules) {
      let s = by.find(x => x.id === (m.section_id ?? 0));
      if (!s) { s = { id: m.section_id ?? 0, title: m.section_title || "Lessons", color: m.section_color || primary, mods: [] }; by.push(s); }
      s.mods.push(m);
    }
    return by.sort((a, b) => a.id - b.id);
  }, [course, primary]);
  const pct = (c: any) => {
    const total = (c.modules || []).length;
    if (!total) return 0;
    return Math.round((c.modules.filter((m: any) => completed.has(String(m.id))).length / total) * 100);
  };
  const lesson = openLesson && course ? course.modules.find((m: any) => m.id === openLesson) : null;
  // Sequential courses lock each lesson until every earlier one is done
  // (in the same order the sections render). Managers are never locked.
  const lockedIds: Set<string> = useMemo(() => {
    const locked = new Set<string>();
    if (!course?.sequential || canManage) return locked;
    let blocked = false;
    for (const s of sections) for (const m of s.mods) {
      if (blocked) locked.add(String(m.id));
      if (!completed.has(String(m.id))) blocked = true;
    }
    return locked;
  }, [course, sections, completed, canManage]);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 40px" }}>
      {!course && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: B.text, margin: 0 }}>Learn</h2>
            {canManage && !assigning && !creating && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setCTitle(""); setCDesc(""); setCSeq(false); setCreating(true); }}
                  style={{ background: primary, color: "#000", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>+ New course</button>
                <button onClick={() => { setPicks(new Set(courses.map((c: any) => String(c.id)))); setAssigning(true); }}
                  style={{ background: "none", color: primary, border: `1px solid ${primary}55`, borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✎ Choose courses</button>
              </div>
            )}
          </div>
          {creating && (
            <Card style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: B.text, margin: "0 0 8px" }}>New course for {dba?.name}</p>
              <input value={cTitle} onChange={e => setCTitle(e.target.value)} placeholder="Course title" style={inp} />
              <textarea value={cDesc} onChange={e => setCDesc(e.target.value)} placeholder="Short description (optional)" rows={2} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: B.muted, cursor: "pointer", margin: "2px 0 6px" }}>
                <input type="checkbox" checked={cSeq} onChange={e => setCSeq(e.target.checked)} />
                Lessons unlock in order (untick to let members jump to any lesson)
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button disabled={busy || !cTitle.trim()} onClick={async () => { if (await saveCourse(null, cTitle, cDesc, cSeq)) setCreating(false); }}
                  style={{ background: primary, color: "#000", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: busy || !cTitle.trim() ? 0.6 : 1 }}>{busy ? "Creating…" : "Create course"}</button>
                <button onClick={() => setCreating(false)} style={{ background: "none", color: B.muted, border: `1px solid ${B.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
              </div>
              <p style={{ fontSize: 10, color: B.muted, margin: "8px 0 0", lineHeight: 1.5 }}>The course is created inside your organization's catalog and assigned to this DBA right away — open it to add lessons.</p>
            </Card>
          )}
          {assigning && (
            <Card style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 12, color: B.muted, margin: "0 0 10px", lineHeight: 1.5 }}>Pick which courses {dba?.name} members can see. Only your organization's courses (and Eden's) can be assigned.</p>
              {(content?.available_courses || []).length === 0 && <p style={{ fontSize: 12, color: B.muted, margin: "0 0 10px" }}>Your organization has no courses yet — build one in the main app's Learn section first.</p>}
              {(content?.available_courses || []).map((c: any) => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${B.border}`, cursor: "pointer" }}>
                  <input type="checkbox" checked={picks.has(String(c.id))}
                    onChange={() => setPicks(p => { const n = new Set(p); n.has(String(c.id)) ? n.delete(String(c.id)) : n.add(String(c.id)); return n; })} />
                  <span style={{ fontSize: 13, color: B.text, fontWeight: 600 }}>{c.title}</span>
                </label>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button disabled={busy} onClick={async () => { if (await saveLearn([...picks])) setAssigning(false); }}
                  style={{ background: primary, color: "#000", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save"}</button>
                <button onClick={() => setAssigning(false)} style={{ background: "none", color: B.muted, border: `1px solid ${B.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
              </div>
            </Card>
          )}
          {courses.length === 0 && !assigning && (
            <Card><p style={{ fontSize: 13, color: B.muted, margin: 0, lineHeight: 1.7 }}>
              {canManage ? "No courses assigned yet — use “Choose courses” to pick what members see here." : "No courses yet — content from your coach will appear here."}
            </p></Card>
          )}
          {courses.map((c: any, i: number) => (
            <div key={c.id} onClick={() => setOpenCourse(c.id)}
              style={{ background: B.card, border: `1px solid ${B.border}`, borderLeft: `3px solid ${courseColor(i)}`, borderRadius: 12, padding: "16px", marginBottom: 12, cursor: "pointer" }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: B.text, margin: 0 }}>{c.title}</p>
              {c.description && <p style={{ fontSize: 12, color: B.muted, margin: "5px 0 0", lineHeight: 1.5 }}>{c.description}</p>}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                <div style={{ flex: 1, height: 5, background: B.dim, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${pct(c)}%`, height: "100%", background: courseColor(i) }} />
                </div>
                <span style={{ fontSize: 11, color: B.muted, fontWeight: 700 }}>{pct(c)}%</span>
              </div>
              <p style={{ fontSize: 10, color: B.muted, margin: "6px 0 0" }}>{(c.modules || []).length} lesson{(c.modules || []).length === 1 ? "" : "s"}</p>
            </div>
          ))}
        </>
      )}
      {course && !lesson && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <button onClick={() => { setOpenCourse(null); setEditMode(false); setLForm(null); }} style={{ background: "none", border: "none", color: B.muted, fontSize: 12, cursor: "pointer", padding: 0 }}>← All courses</button>
            {canManage && course.editable && (
              <button onClick={() => { setEditMode(e => !e); setLForm(null); }}
                style={{ background: editMode ? primary : "none", color: editMode ? "#000" : primary, border: `1px solid ${primary}55`, borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {editMode ? "Done editing" : "✎ Edit course"}</button>
            )}
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: B.text, margin: "0 0 4px" }}>{course.title}</h2>
          {course.description && <p style={{ fontSize: 12, color: B.muted, margin: "0 0 16px", lineHeight: 1.6 }}>{course.description}</p>}
          {course.sequential && !canManage && <p style={{ fontSize: 10, color: B.muted, margin: "0 0 12px" }}>🔒 Lessons in this course unlock in order.</p>}
          {editMode && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: B.text, cursor: "pointer", background: B.card, border: `1px solid ${B.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
              <input type="checkbox" checked={!!course.sequential} disabled={busy}
                onChange={e => saveCourse(course.id, course.title, course.description, e.target.checked)} />
              <span><b>Lessons unlock in order</b> — members must complete each lesson before the next opens. Unticked: they can jump to any lesson anytime.</span>
            </label>
          )}
          {editMode && !lForm && (
            <button onClick={() => setLForm({ lessonId: null, sectionTitle: sections[sections.length - 1]?.title || "", title: "", duration: "", videoUrl: "", notes: "" })}
              style={{ background: "none", color: primary, border: `1px dashed ${primary}66`, borderRadius: 10, padding: "10px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", width: "100%", marginBottom: 14 }}>+ Add a lesson</button>
          )}
          {editMode && lForm && (
            <Card style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: B.text, margin: "0 0 8px" }}>{lForm.lessonId ? "Edit lesson" : "New lesson"}</p>
              {!lForm.lessonId && <input value={lForm.sectionTitle} onChange={e => setLForm((p: any) => ({ ...p, sectionTitle: e.target.value }))} placeholder='Section (e.g. "Getting Started" — reuses a section with the same name)' style={inp} />}
              <input value={lForm.title} onChange={e => setLForm((p: any) => ({ ...p, title: e.target.value }))} placeholder="Lesson title" style={inp} />
              <div style={{ display: "flex", gap: 8 }}>
                <input value={lForm.duration} onChange={e => setLForm((p: any) => ({ ...p, duration: e.target.value }))} placeholder="Duration (e.g. 8 min)" style={{ ...inp, flex: 1 }} />
              </div>
              <input value={lForm.videoUrl} onChange={e => setLForm((p: any) => ({ ...p, videoUrl: e.target.value }))} placeholder="Video link — YouTube, Vimeo or Loom (optional)" style={{ ...inp, fontFamily: "monospace" }} />
              <textarea value={lForm.notes} onChange={e => setLForm((p: any) => ({ ...p, notes: e.target.value }))} placeholder="Lesson notes members will read (optional)" rows={4} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button disabled={busy || !lForm.title.trim()} onClick={async () => {
                  const ok = await saveLesson({ courseId: course.id, lessonId: lForm.lessonId, sectionTitle: lForm.sectionTitle, title: lForm.title, duration: lForm.duration, videoUrl: dbaToEmbed(lForm.videoUrl), notes: lForm.notes });
                  if (ok) setLForm(null);
                }} style={{ background: primary, color: "#000", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: busy || !lForm.title.trim() ? 0.6 : 1 }}>{busy ? "Saving…" : "Save lesson"}</button>
                <button onClick={() => setLForm(null)} style={{ background: "none", color: B.muted, border: `1px solid ${B.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
              </div>
            </Card>
          )}
          {sections.length === 0 && editMode && !lForm && (
            <p style={{ fontSize: 12, color: B.muted, lineHeight: 1.6 }}>No lessons yet — add your first one above. Group lessons by giving them the same section name.</p>
          )}
          {sections.map((s: any) => (
            <div key={s.id} style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: s.color || primary, letterSpacing: 0.8, textTransform: "uppercase", margin: "0 0 8px" }}>{s.title}</p>
              {s.mods.map((m: any) => {
                const done = completed.has(String(m.id));
                const locked = lockedIds.has(String(m.id));
                return (
                  <div key={m.id} onClick={() => { if (!editMode && !locked) setOpenLesson(m.id); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, background: B.card, border: `1px solid ${B.border}`, borderRadius: 10, padding: "11px 14px", marginBottom: 8, cursor: editMode || locked ? "default" : "pointer", opacity: locked ? 0.55 : 1 }}>
                    <span style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: done ? primary : B.dim, color: done ? "#000" : B.muted, fontSize: 11, fontWeight: 800 }}>{done ? "✓" : locked ? "🔒" : ""}</span>
                    <span style={{ flex: 1, fontSize: 13, color: B.text, fontWeight: 600 }}>{m.title}</span>
                    {locked && <span style={{ fontSize: 9, color: B.muted, fontWeight: 700 }}>Finish earlier lessons</span>}
                    {m.duration && <span style={{ fontSize: 10, color: B.muted }}>{m.duration}</span>}
                    {editMode && (
                      <>
                        <button onClick={() => setLForm({ lessonId: m.id, sectionTitle: s.title, title: m.title || "", duration: m.duration || "", videoUrl: m.video_url || "", notes: m.admin_notes || "" })}
                          style={{ background: "none", color: primary, border: `1px solid ${primary}55`, borderRadius: 7, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Edit</button>
                        <button disabled={busy} onClick={() => { if (confirm(`Delete "${m.title}"? Members' progress on it is lost.`)) deleteLesson(course.id, m.id); }}
                          style={{ background: "none", color: "#e05a5a", border: `1px solid ${B.border}`, borderRadius: 7, padding: "4px 10px", fontSize: 10, cursor: "pointer" }}>Delete</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
      {lesson && (
        <>
          <button onClick={() => setOpenLesson(null)} style={{ background: "none", border: "none", color: B.muted, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 12 }}>← {course.title}</button>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: B.text, margin: "0 0 12px" }}>{lesson.title}</h2>
          {lesson.video_url && (
            <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, marginBottom: 16, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.border}` }}>
              <iframe src={lesson.video_url} title={lesson.title} allowFullScreen
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }} />
            </div>
          )}
          {lesson.admin_notes && (
            <Card style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: B.text, margin: 0, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{lesson.admin_notes}</p>
            </Card>
          )}
          <button disabled={busy} onClick={() => markLesson(course.id, lesson.id, !completed.has(String(lesson.id)))}
            style={{ background: completed.has(String(lesson.id)) ? B.dim : primary, color: completed.has(String(lesson.id)) ? B.muted : "#000", border: "none", borderRadius: 10, padding: "11px 20px", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
            {completed.has(String(lesson.id)) ? "✓ Completed — tap to undo" : "Mark lesson complete"}
          </button>
        </>
      )}
    </div>
  );
};

// HQ tab — the DBA's own back office: invite members, assign tiers,
// define the tier ladder, and gate courses by tier. Managers only.
const DbaHq = ({ dba, primary, content }: any) => {
  const [hq, setHq] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "" });
  const [tierDraft, setTierDraft] = useState<any[] | null>(null);
  const load = useCallback(() => {
    fetch(`${DBA_API('hq')}?dbaId=${encodeURIComponent(dba.id)}`, { headers: { Authorization: sbBearer() } })
      .then(r => (r.ok ? r.json() : null)).then(b => setHq(b?.ok ? b : { members: [], effective_defs: [], tier_defs: [], learn_tiers: {} }))
      .catch(() => setHq({ members: [], effective_defs: [], tier_defs: [], learn_tiers: {} }));
  }, [dba.id]);
  useEffect(() => { setHq(null); load(); }, [load]);
  const post = async (path: string, body: any) => {
    setBusy(true);
    try {
      const r = await fetch(DBA_API(path), { method: "POST", headers: { "Content-Type": "application/json", Authorization: sbBearer() }, body: JSON.stringify({ dbaId: dba.id, ...body }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { alert(b?.error || "Couldn't save — try again."); return false; }
      load();
      return true;
    } catch { alert("Couldn't reach the server — try again."); return false; }
    finally { setBusy(false); }
  };
  const inp = { width: "100%", boxSizing: "border-box" as const, background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 10px", color: B.text, fontSize: 12, outline: "none", marginBottom: 6 };
  const defs = hq?.effective_defs || [];
  const courses = (content?.courses || []);
  if (hq === null) return <div style={{ padding: 60, textAlign: "center" }}><p style={{ color: B.muted, fontSize: 13 }}>Loading…</p></div>;
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 40px" }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: B.text, margin: "0 0 4px" }}>{dba?.name} HQ</h2>
      <p style={{ fontSize: 12, color: B.muted, margin: "0 0 16px", lineHeight: 1.6 }}>Invite members, set their tier, and decide what each tier unlocks. Members never see this tab.</p>

      {/* ── Tier ladder ── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: B.text, margin: 0 }}>Membership tiers</p>
          {!tierDraft && (
            <button onClick={() => setTierDraft((hq.custom ? hq.tier_defs : defs).map((t: any) => ({ ...t })))}
              style={{ background: "none", color: primary, border: `1px solid ${primary}55`, borderRadius: 8, padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✎ Edit tiers</button>
          )}
        </div>
        {!hq.custom && !tierDraft && <p style={{ fontSize: 11, color: B.muted, margin: "0 0 8px", lineHeight: 1.5 }}>Using your organization's default ladder — edit to make tiers specific to {dba?.name}.</p>}
        {!tierDraft && defs.map((t: any, i: number) => (
          <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: i < defs.length - 1 ? `1px solid ${B.border}` : "none" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: primary, border: `1px solid ${primary}55`, borderRadius: 6, padding: "2px 7px", flexShrink: 0, marginTop: 1 }}>TIER {i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: B.text, margin: 0 }}>{t.name}{t.dm && <span style={{ fontSize: 9, color: B.muted, fontWeight: 600 }}> · can DM</span>}</p>
              {t.desc && <p style={{ fontSize: 11, color: B.muted, margin: "2px 0 0", lineHeight: 1.5 }}>{t.desc}</p>}
            </div>
          </div>
        ))}
        {tierDraft && (
          <>
            {tierDraft.map((t: any, i: number) => (
              <div key={i} style={{ borderBottom: `1px solid ${B.border}`, paddingBottom: 10, marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: primary, flexShrink: 0 }}>TIER {i + 1}</span>
                  <input value={t.name} onChange={e => setTierDraft(p => p!.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder={`Tier ${i + 1} name`} style={{ ...inp, marginBottom: 0, flex: 1 }} />
                  {tierDraft.length > 1 && <button onClick={() => setTierDraft(p => p!.filter((_, j) => j !== i))} style={{ background: "none", color: "#e05a5a", border: `1px solid ${B.border}`, borderRadius: 7, padding: "6px 10px", fontSize: 10, cursor: "pointer" }}>Remove</button>}
                </div>
                <input value={t.desc || ""} onChange={e => setTierDraft(p => p!.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))} placeholder="What this tier includes (members-facing detail)" style={inp} />
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: B.muted, cursor: "pointer", marginRight: 14 }}>
                  <input type="checkbox" checked={!!t.dm} onChange={e => setTierDraft(p => p!.map((x, j) => j === i ? { ...x, dm: e.target.checked } : x))} /> Can send direct messages
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: B.muted, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!t.app} onChange={e => setTierDraft(p => p!.map((x, j) => j === i ? { ...x, app: e.target.checked } : x))} /> Eligible for full app access
                </label>
              </div>
            ))}
            {tierDraft.length < 3 && (
              <button onClick={() => setTierDraft(p => [...p!, { id: "", name: "", desc: "", dm: false, app: false }])}
                style={{ background: "none", color: primary, border: `1px dashed ${primary}66`, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", width: "100%", marginBottom: 10 }}>+ Add tier</button>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={busy || tierDraft.some(t => !t.name.trim())} onClick={async () => { if (await post("tier-defs-set", { defs: tierDraft })) setTierDraft(null); }}
                style={{ background: primary, color: "#000", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: busy || tierDraft.some(t => !t.name.trim()) ? 0.6 : 1 }}>{busy ? "Saving…" : "Save tiers"}</button>
              <button onClick={() => setTierDraft(null)} style={{ background: "none", color: B.muted, border: `1px solid ${B.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
            </div>
            <p style={{ fontSize: 10, color: B.muted, margin: "8px 0 0", lineHeight: 1.5 }}>Up to 3 tiers. Removing a tier clears it from any member who held it.</p>
          </>
        )}
      </Card>

      {/* ── Invite ── */}
      <Card style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: B.text, margin: "0 0 8px" }}>Invite a member</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={invite.name} onChange={e => setInvite(p => ({ ...p, name: e.target.value }))} placeholder="Full name" style={{ ...inp, flex: 1, minWidth: 140 }} />
          <input value={invite.email} onChange={e => setInvite(p => ({ ...p, email: e.target.value }))} placeholder="Email" style={{ ...inp, flex: 1.4, minWidth: 180 }} />
          <button disabled={busy || !invite.name.trim() || !invite.email.trim()}
            onClick={async () => { if (await post("member-add", { name: invite.name.trim(), email: invite.email.trim() })) setInvite({ name: "", email: "" }); }}
            style={{ background: primary, color: "#000", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: busy || !invite.name.trim() || !invite.email.trim() ? 0.6 : 1, alignSelf: "flex-start" }}>Invite</button>
        </div>
        <p style={{ fontSize: 10, color: B.muted, margin: "6px 0 0", lineHeight: 1.5 }}>New people get a {dba?.name}-branded welcome email with their login. Assign their tier below once they appear.</p>
      </Card>

      {/* ── Members & tiers ── */}
      <Card style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: B.text, margin: "0 0 8px" }}>Members ({hq.members.length})</p>
        {hq.members.length === 0 && <p style={{ fontSize: 12, color: B.muted, margin: 0 }}>No members yet — invite your first one above.</p>}
        {hq.members.map((m: any) => (
          <div key={m.email} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${B.border}`, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: B.text, margin: 0 }}>{m.name || m.email}</p>
              <p style={{ fontSize: 10, color: B.muted, margin: 0 }}>{m.email}</p>
            </div>
            <select value={m.tier || ""} disabled={busy || !m.id}
              onChange={e => post("tier-set", { userId: m.id, tierId: e.target.value })}
              style={{ background: B.dim, color: m.tier ? B.text : B.muted, border: `1px solid ${B.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 11, outline: "none" }}>
              <option value="">No tier</option>
              {defs.map((t: any, i: number) => <option key={t.id} value={t.id}>Tier {i + 1} — {t.name}</option>)}
            </select>
            <button disabled={busy} onClick={() => { if (confirm(`Remove ${m.name || m.email} from ${dba?.name}? Their login stays, but they lose access to this space.`)) post("member-remove", { email: m.email }); }}
              style={{ background: "none", color: "#e05a5a", border: `1px solid ${B.border}`, borderRadius: 7, padding: "5px 10px", fontSize: 10, cursor: "pointer" }}>Remove</button>
          </div>
        ))}
      </Card>

      {/* ── Authorities at a glance ── */}
      <Card style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: B.text, margin: "0 0 4px" }}>Authorities</p>
        <p style={{ fontSize: 11, color: B.muted, margin: "0 0 10px", lineHeight: 1.5 }}>Every member's chat powers in one place — delete, pin and canvas per group, plus their direct-message override. Tick to grant, untick to revoke.</p>
        {(hq.channels || []).length === 0 && <p style={{ fontSize: 12, color: B.muted, margin: 0 }}>No group chats yet — create one in the Community tab first.</p>}
        {hq.members.filter((m: any) => m.id).map((m: any, mi: number) => {
          const memberCaps = (hq.channels || []).map((ch: any) => ({ ch, caps: (hq.leaders?.[ch.id] || {})[m.id] || {} }));
          const hasAny = m.dm || memberCaps.some(({ caps }: any) => caps.del || caps.pin || caps.canvas);
          const setCap = async (chId: string, key: string, val: boolean) => {
            // Optimistic so rapid toggles feel instant; post() reloads on success
            const prev = hq.leaders;
            setHq((h: any) => ({ ...h, leaders: { ...h.leaders, [chId]: { ...(h.leaders?.[chId] || {}), [m.id]: { ...((h.leaders?.[chId] || {})[m.id] || {}), [key]: val } } } }));
            if (!(await post("authority-set", { userId: m.id, patch: { [key]: val }, communityIds: [chId] }))) setHq((h: any) => ({ ...h, leaders: prev }));
          };
          const setAllCap = async (key: string, val: boolean) => {
            if (!(hq.channels || []).length) return;
            await post("authority-set", { userId: m.id, patch: { [key]: val }, all: true });
          };
          return (
            <div key={m.id} style={{ padding: "10px 0", borderBottom: mi < hq.members.filter((x: any) => x.id).length - 1 ? `1px solid ${B.border}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: hasAny || (hq.channels || []).length ? 6 : 0 }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: B.text, margin: 0 }}>{m.name || m.email}
                    {!hasAny && <span style={{ fontSize: 9, color: B.muted, fontWeight: 600 }}> · no powers</span>}</p>
                </div>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: m.dm ? primary : B.muted, cursor: "pointer", fontWeight: m.dm ? 700 : 400 }}>
                  <input type="checkbox" checked={!!m.dm} disabled={busy}
                    onChange={e => post("dm-enable", { userId: m.id, enabled: e.target.checked })} /> Direct messages
                </label>
              </div>
              {(hq.channels || []).length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(90px, 1fr) auto auto auto", gap: "3px 14px", alignItems: "center" }}>
                  <span />
                  {["del", "pin", "canvas"].map(k => (
                    <button key={k} disabled={busy} title={`Toggle ${k === "del" ? "delete" : k} in every group`}
                      onClick={() => setAllCap(k, !(hq.channels || []).every((ch: any) => !!((hq.leaders?.[ch.id] || {})[m.id] || {})[k]))}
                      style={{ background: "none", border: "none", color: B.muted, fontSize: 9, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", cursor: "pointer", padding: 0, textAlign: "center" }}>
                      {k === "del" ? "Delete" : k === "pin" ? "Pin" : "Canvas"} ⇅
                    </button>
                  ))}
                  {memberCaps.map(({ ch, caps }: any) => [
                    <span key={`${ch.id}-n`} style={{ fontSize: 11, color: (caps.del || caps.pin || caps.canvas) ? B.text : B.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</span>,
                    ...["del", "pin", "canvas"].map(k => (
                      <span key={`${ch.id}-${k}`} style={{ textAlign: "center" }}>
                        <input type="checkbox" checked={!!caps[k]} disabled={busy}
                          onChange={e => setCap(ch.id, k, e.target.checked)} style={{ cursor: "pointer" }} />
                      </span>
                    )),
                  ])}
                </div>
              )}
            </div>
          );
        })}
        {hq.members.filter((m: any) => m.id).length === 0 && <p style={{ fontSize: 12, color: B.muted, margin: 0 }}>No members yet — invite one above.</p>}
      </Card>

      {/* ── Course access by tier ── */}
      <Card>
        <p style={{ fontSize: 13, fontWeight: 800, color: B.text, margin: "0 0 4px" }}>Course access by tier</p>
        <p style={{ fontSize: 11, color: B.muted, margin: "0 0 10px", lineHeight: 1.5 }}>Untick every tier to open a course to all members. Members below the required tier simply don't see the course.</p>
        {courses.length === 0 && <p style={{ fontSize: 12, color: B.muted, margin: 0 }}>No courses assigned yet — add them in the Learn tab first.</p>}
        {courses.map((c: any) => {
          const gate: string[] = hq.learn_tiers?.[String(c.id)] || [];
          return (
            <div key={c.id} style={{ padding: "9px 0", borderBottom: `1px solid ${B.border}` }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: B.text, margin: "0 0 5px" }}>{c.title}
                {gate.length === 0 && <span style={{ fontSize: 9, color: B.muted, fontWeight: 600 }}> · everyone</span>}</p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {defs.map((t: any, i: number) => (
                  <label key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: B.muted, cursor: "pointer" }}>
                    <input type="checkbox" checked={gate.includes(t.id)} disabled={busy}
                      onChange={async e => {
                        const next = e.target.checked ? [...gate, t.id] : gate.filter(x => x !== t.id);
                        // Optimistic so rapid toggles never build on a stale list
                        const prev = hq.learn_tiers;
                        setHq((h: any) => ({ ...h, learn_tiers: { ...h.learn_tiers, [String(c.id)]: next } }));
                        if (!(await post("learn-tiers", { courseId: c.id, tierIds: next }))) setHq((h: any) => ({ ...h, learn_tiers: prev }));
                      }} /> Tier {i + 1} — {t.name}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
};

const DbaHome = ({ user, dbas, initialSlug, onEnterApp, onLogout }: any) => {
  const [activeId, setActiveId] = useState(() => {
    const hit = initialSlug ? dbas.find((d: any) => d.slug === initialSlug) : null;
    return (hit || dbas[0])?.id;
  });
  const dba = dbas.find((d: any) => d.id === activeId) || dbas[0];
  const wl = wlPalette(dba);
  const primary = wl?.primary || B.gold;
  const secondary = wl?.secondary || primary;
  const accent = wl?.accent || primary;
  const hasPalette = (wl?.extra || []).length > 0;
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<"home" | "community" | "huddles" | "calendar" | "connect" | "learn" | "hq">("home");
  // Light poll so the join banner shows on any tab when a huddle we're
  // allowed into goes live (the Huddles tab does its own full loading).
  const [liveHuddleCount, setLiveHuddleCount] = useState(0);
  useEffect(() => {
    if (!dba?.id) return;
    let stop = false;
    const check = () => {
      fetch(`${DBA_API('huddles')}?id=${encodeURIComponent(dba.id)}`, { headers: { Authorization: sbBearer() } })
        .then(r => (r.ok ? r.json() : null))
        .then(b => { if (!stop && b?.ok) setLiveHuddleCount((b.huddles || []).length); })
        .catch(() => {});
    };
    check();
    const iv = setInterval(check, 15000);
    return () => { stop = true; clearInterval(iv); };
  }, [dba?.id]);
  const [content, setContent] = useState<any>(null); // null = loading
  const [busy, setBusy] = useState(false);
  const loadContent = useCallback(() => {
    if (!dba?.id) return;
    fetch(`${DBA_API('content')}?id=${encodeURIComponent(dba.id)}`, { headers: { Authorization: sbBearer() } })
      .then(r => (r.ok ? r.json() : null))
      .then(b => setContent(b?.ok ? b : { connect: [], courses: [], completed: [], can_manage: false }))
      .catch(() => setContent({ connect: [], courses: [], completed: [], can_manage: false }));
  }, [dba?.id]);
  useEffect(() => { setContent(null); setTab("home"); loadContent(); }, [dba?.id, loadContent]);

  // Point the phone-install target at this DBA — an installed icon should
  // reopen /<slug> with the DBA's name (and logo where the platform allows).
  useEffect(() => {
    if (!dba?.slug) return;
    applyPwaBrand({ name: dba.name, slug: dba.slug, logoUrl: dba.logo_url, themeColor: dba.brand_color });
  }, [dba?.id]); // eslint-disable-line
  // Restore the Eden install target on any way out of the DBA space
  // (staff "Open the full app", logout, unmount)
  useEffect(() => () => resetPwaBrand(), []);

  const postDba = async (path: string, body: any) => {
    setBusy(true);
    try {
      const r = await fetch(DBA_API(path), { method: "POST", headers: { "Content-Type": "application/json", Authorization: sbBearer() }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { alert(b?.error || "Couldn't save — try again."); return false; }
      loadContent();
      return true;
    } catch { alert("Couldn't reach the server — try again."); return false; }
    finally { setBusy(false); }
  };
  const saveConnect = (links: any[]) => postDba("connect-save", { dbaId: dba.id, connect: links });
  const saveLearn = (courseIds: string[]) => postDba("learn-save", { dbaId: dba.id, courseIds });
  const saveCourse = (courseId: string | null, title: string, description: string, sequential?: boolean) => postDba("course-save", { dbaId: dba.id, courseId, title, description, ...(sequential !== undefined ? { sequential } : {}) });
  const saveLesson = (body: any) => postDba("lesson-save", { dbaId: dba.id, ...body });
  const deleteLesson = (courseId: string, lessonId: string) => postDba("lesson-delete", { dbaId: dba.id, courseId, lessonId });
  const markLesson = async (courseId: string, moduleId: string, done: boolean) => {
    // Optimistic update so the checkmark feels instant
    setContent((p: any) => p ? { ...p, completed: done ? [...p.completed, String(moduleId)] : p.completed.filter((x: string) => x !== String(moduleId)) } : p);
    await postDba("progress", { dbaId: dba.id, courseId, moduleId, completed: done });
  };

  const TABS: Array<{ id: "home" | "community" | "huddles" | "calendar" | "connect" | "learn" | "hq"; icon: string; label: string }> = [
    { id: "home", icon: "home", label: "Home" },
    { id: "community", icon: "community", label: "Community" },
    { id: "huddles", icon: "watch", label: "Huddles" },
    { id: "calendar", icon: "calendar", label: "Calendar" },
    { id: "connect", icon: "links", label: "Connect" },
    { id: "learn", icon: "learn", label: "Learn" },
    // Managers get the DBA's own back office
    ...(content?.can_manage ? [{ id: "hq" as const, icon: "settings", label: "HQ" }] : []),
  ];
  const linkCount = content?.connect?.length || 0;
  const courseCount = content?.courses?.length || 0;

  return (
    <div style={{ height: "100vh", width: "100%", background: B.black, display: "flex", flexDirection: "column" }}>
      <div style={{ background: B.surface, borderBottom: `1px solid ${B.border}`, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <OrgLogo org={dba} size={32} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: B.text, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dba?.name}</p>
            {dba?.org?.name && <p style={{ fontSize: 9, color: B.muted, margin: 0 }}>part of {dba.org.name}</p>}
          </div>
          {content?.can_manage && <span style={{ fontSize: 9, fontWeight: 800, color: accent, border: `1px solid ${accent}55`, borderRadius: 20, padding: "2px 8px", letterSpacing: 0.6 }}>MANAGER VIEW</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!isMobile && TABS.map((t) => {
            const tc = primary; // one brand color for every active tab
            return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ background: tab === t.id ? `${tc}22` : "none", color: tab === t.id ? tc : B.muted, border: `1px solid ${tab === t.id ? tc + "55" : "transparent"}`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {t.label}
            </button>
          );})}
          {dbas.length > 1 && (
            <select value={activeId} onChange={(e) => setActiveId(e.target.value)}
              style={{ background: B.dim, color: B.text, border: `1px solid ${B.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 12, outline: "none" }}>
              {dbas.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          {onEnterApp && (
            <button onClick={onEnterApp}
              style={{ background: "none", color: B.text, border: `1px solid ${B.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Open the full app →
            </button>
          )}
          <button onClick={onLogout}
            style={{ background: "none", color: B.muted, border: `1px solid ${B.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer" }}>
            Log out
          </button>
        </div>
      </div>

      {liveHuddleCount > 0 && tab !== "huddles" && (
        <div onClick={() => setTab("huddles")}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: `${secondary}1e`, borderBottom: `1px solid ${secondary}55`, padding: "8px 14px", cursor: "pointer" }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: "#4FD89A", boxShadow: "0 0 8px #4FD89A" }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: secondary }}>
            {liveHuddleCount === 1 ? "A huddle is live" : `${liveHuddleCount} huddles are live`} — tap to join
          </span>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {content === null ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
            <p style={{ color: B.muted, fontSize: 13 }}>Loading…</p>
          </div>
        ) : tab === "community" ? (
          <div style={{ maxWidth: 1080, margin: "0 auto", padding: isMobile ? "10px 8px 16px" : "20px 16px 30px", height: "100%", boxSizing: "border-box" }}>
            <DbaChat dba={dba} primary={primary} palette={wl} isMobile={isMobile} />
          </div>
        ) : tab === "huddles" ? (
          null /* DbaHuddles is mounted below (always), so an active call survives tab switches */
        ) : tab === "calendar" ? (
          <DbaCalendar dba={dba} primary={primary} palette={wl} isMobile={isMobile} />
        ) : tab === "connect" ? (
          <DbaConnect primary={primary} content={content} saveConnect={saveConnect} busy={busy} dba={dba} />
        ) : tab === "hq" && content?.can_manage ? (
          <DbaHq dba={dba} primary={primary} content={content} />
        ) : tab === "learn" ? (
          <DbaLearn primary={primary} palette={wl} content={content} dba={dba} saveLearn={saveLearn} markLesson={markLesson} busy={busy}
            saveCourse={saveCourse} saveLesson={saveLesson} deleteLesson={deleteLesson} />
        ) : (
          <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 16px 40px" }}>
            <div style={{ textAlign: "center", background: hasPalette ? `linear-gradient(160deg, ${primary}20 0%, ${secondary}12 55%, ${B.surface} 100%)` : `linear-gradient(160deg, ${primary}18 0%, ${B.surface} 100%)`, border: `1px solid ${hasPalette ? `${accent}33` : B.border}`, borderRadius: 16, padding: isMobile ? "32px 20px" : "42px 32px", marginBottom: 18 }}>
              <OrgLogo org={dba} size={76} />
              <h1 style={{ fontSize: 24, fontWeight: 800, color: B.text, margin: "16px 0 6px" }}>Welcome to {dba?.name}</h1>
              <p style={{ fontSize: 13, color: B.muted, margin: 0, lineHeight: 1.7 }}>
                Hi {String(user?.name || "").split(" ")[0] || "there"} — this is {dba?.name}'s private member space.
              </p>
              {hasPalette && (
                <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }}>
                  {wl.all.slice(0, 6).map((c: string, i: number) => (
                    <span key={i} style={{ width: 12, height: 12, borderRadius: 6, background: c, display: "inline-block", border: "1px solid #00000055" }} />
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
              <div onClick={() => setTab("connect")} style={{ background: B.card, border: `1px solid ${B.border}`, borderLeft: `3px solid ${secondary}`, borderRadius: 14, padding: "18px 16px", cursor: "pointer" }}>
                <Ic n="links" size={22} c={secondary} />
                <p style={{ fontSize: 15, fontWeight: 800, color: B.text, margin: "10px 0 2px" }}>Connect</p>
                <p style={{ fontSize: 12, color: B.muted, margin: 0, lineHeight: 1.5 }}>{linkCount ? `${linkCount} link${linkCount === 1 ? '' : 's'} from your coach` : "Links & resources"}</p>
              </div>
              <div onClick={() => setTab("learn")} style={{ background: B.card, border: `1px solid ${B.border}`, borderLeft: `3px solid ${accent}`, borderRadius: 14, padding: "18px 16px", cursor: "pointer" }}>
                <Ic n="learn" size={22} c={accent} />
                <p style={{ fontSize: 15, fontWeight: 800, color: B.text, margin: "10px 0 2px" }}>Learn</p>
                <p style={{ fontSize: 12, color: B.muted, margin: 0, lineHeight: 1.5 }}>{courseCount ? `${courseCount} course${courseCount === 1 ? '' : 's'} available` : "Courses & lessons"}</p>
              </div>
            </div>
            <p style={{ fontSize: 11, color: B.muted, margin: "16px 0 0", textAlign: "center", lineHeight: 1.6 }}>Jump into a live huddle or check the calendar from the tabs above.</p>
          </div>
        )}
      </div>

      {/* Always mounted so an active DBA call survives switching tabs (Learn, Community, etc.) */}
      <DbaHuddles dba={dba} primary={primary} isMobile={isMobile} visible={tab === "huddles"} />

      {isMobile && (
        <div style={{ display: "flex", background: B.surface, borderTop: `1px solid ${B.border}`, paddingBottom: "env(safe-area-inset-bottom)" }}>
          {TABS.map((t) => {
            const tc = primary; // one brand color for every active tab (matches desktop)
            return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: "8px 0 10px" }}>
              <Ic n={t.icon} size={20} c={tab === t.id ? tc : B.muted} />
              <span style={{ fontSize: 9, fontWeight: 600, color: tab === t.id ? tc : B.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>{t.label}</span>
            </button>
          );})}
        </div>
      )}

      {/* Same install nudge as the main app, branded for this DBA */}
      <InstallBanner brandName={dba?.name || 'Eden'} />
    </div>
  );
};

// ─── DBA manager card (org admin settings) ───────────────────────────────────
// Lets a Tier-3 org admin create sub-brands (DBAs), assign a coach, brand
// them, invite members and share each DBA's own login link. Hidden entirely
// when the org's plan doesn't include DBAs (server decides).
// Owner HQ wrapper: pick any organization (including Eden itself), then the
// regular DBA manager runs against it — same screens, same abilities.
const HqDbaManager = ({ orgs }: any) => {
  const eden = { id: EDEN_ORG_ID, name: 'Lifestyle of Eden University', slug: '', brand_color: B.gold, logo_url: null };
  const list = [eden, ...(orgs || []).filter((o: any) => o.id !== EDEN_ORG_ID && o.is_active !== false)];
  const [selId, setSelId] = useState(eden.id);
  const sel = list.find((o: any) => o.id === selId) || eden;
  return (
    <Card style={{ marginBottom: 20, borderLeft: `3px solid ${B.gold}` }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: B.gold, letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 6px' }}>⭐ DBAs (Sub-Brands)</p>
      <p style={{ fontSize: 12, color: B.muted, margin: '0 0 10px', lineHeight: 1.5 }}>
        Create and manage branded member spaces. Pick which organization you're working in — as the owner, you can manage every org's DBAs from here.
      </p>
      <select value={selId} onChange={e => setSelId(e.target.value)}
        style={{ width: '100%', background: B.dim, color: B.text, border: `1px solid ${B.border}`, borderRadius: 8, padding: '9px 10px', fontSize: 13, outline: 'none', marginBottom: 12 }}>
        {list.map((o: any) => <option key={o.id} value={o.id}>{o.name}{o.id === EDEN_ORG_ID ? ' (your company)' : ''}</option>)}
      </select>
      <DbaManagerCard key={sel.id} org={sel} hqOrgId={sel.id}/>
    </Card>
  );
};

const DbaManagerCard = ({ org, hqOrgId }: any) => {
  const BASE = (import.meta.env.BASE_URL || '/');
  // When Eden HQ manages another org's DBAs, every admin call carries orgId
  const orgQs = hqOrgId ? `orgId=${encodeURIComponent(hqOrgId)}` : '';
  const [st, setSt] = useState<any>({ loading: true, allowed: false, dbas: [] });
  const [coaches, setCoaches] = useState<any[]>([]);
  const [form, setForm] = useState<any>(null);       // new/edit DBA draft
  const [openId, setOpenId] = useState<string | null>(null); // members panel
  const [memberDraft, setMemberDraft] = useState({ name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [copiedId, setCopiedId] = useState('');
  // Tier ladder (org-wide) + per-DBA member tiers (Phase 4)
  const [tierDefs, setTierDefs] = useState<any[]>([]);
  const [canEditTiers, setCanEditTiers] = useState(false);
  const [tierDraft, setTierDraft] = useState<any[] | null>(null); // editing copy
  const [dbaTiers, setDbaTiers] = useState<any>({});              // openId's { userId: tierId }
  const [promoteFor, setPromoteFor] = useState('');               // member id showing coach picker
  const [staff, setStaff] = useState<any[]>([]);                  // org staff/VAs for delegation
  const [channels, setChannels] = useState<any[] | null>(null);   // openId's chat channels
  // Logo upload (same flow as org logos: real file storage, small-file fallback)
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoErr, setLogoErr] = useState('');
  const logoFileRef = useRef<HTMLInputElement>(null);
  const onLogoFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setLogoErr('Please choose an image file.'); return; }
    if (file.size > 2 * 1024 * 1024) { setLogoErr('Image too large — please use a file under 2 MB.'); return; }
    setLogoErr(''); setLogoBusy(true);
    // Only apply the finished upload to the draft that started it — if the
    // editor was cancelled or switched to another DBA meanwhile, drop it.
    const draftId = form?.id || null;
    const applyIfSameDraft = (url: string) =>
      setForm((p: any) => (p && (p.id || null) === draftId ? { ...p, logoUrl: url } : p));
    try {
      // Preferred: real file storage (shared org-logos bucket, dba-prefixed path)
      const url = await sbUploadLogo(`dba-${draftId || org.id}`, file);
      if (url) { applyIfSameDraft(url); return; }
      // Fallback if the storage bucket isn't set up yet: store small images inline
      if (file.size > 400 * 1024) {
        setLogoErr('File storage isn\u2019t set up yet — use a file under 400 KB, or paste a hosted image URL.');
        return;
      }
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      applyIfSameDraft(dataUrl);
    } catch { setLogoErr('Upload failed — try again or paste a hosted image URL.'); }
    finally { setLogoBusy(false); }
  };
  const hdrs = () => ({ 'Content-Type': 'application/json', Authorization: sbBearer() });
  const reload = () =>
    fetch(`${BASE}api/dba/list${orgQs ? `?${orgQs}` : ''}`, { headers: { Authorization: sbBearer() } })
      .then(r => (r.ok ? r.json() : null))
      .then(b => setSt({ loading: false, allowed: !!b?.allowed, dbas: b?.dbas || [] }))
      .catch(() => setSt((s: any) => ({ ...s, loading: false })));
  useEffect(() => {
    setSt({ loading: true, allowed: false, dbas: [] }); setOpenId(null); setForm(null);
    reload();
    // Rosters come from the server (RLS blocks HQ from reading another org's profiles directly)
    fetch(`${BASE}api/dba/org-staff${orgQs ? `?${orgQs}` : ''}`, { headers: { Authorization: sbBearer() } })
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (b?.ok) { setCoaches(b.coaches || []); setStaff(b.staff || []); } })
      .catch(() => {});
    fetch(`${BASE}api/dba/tier-defs${orgQs ? `?${orgQs}` : ''}`, { headers: { Authorization: sbBearer() } })
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (b?.ok) { setTierDefs(b.defs || []); setCanEditTiers(!!b.can_edit); } })
      .catch(() => {});
  }, [org.id]);
  // Per-DBA Daily.co connection (video calls for this sub-brand)
  const [dbaDaily, setDbaDaily] = useState<any>(null);  // null loading · {connected, source}
  const [dbaDailyIn, setDbaDailyIn] = useState('');
  const [dbaDailyMsg, setDbaDailyMsg] = useState('');
  const dbaDailyReq = useRef('');                       // guards against stale responses when switching DBAs
  const loadDbaDaily = (id: string) => {
    setDbaDaily(null);
    dbaDailyReq.current = id;
    fetch(`${BASE}api/dba/daily-status?id=${encodeURIComponent(id)}`, { headers: { Authorization: sbBearer() } })
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (dbaDailyReq.current === id) setDbaDaily(b?.ok ? b : { connected: false, source: 'none' }); })
      .catch(() => { if (dbaDailyReq.current === id) setDbaDaily({ connected: false, source: 'none' }); });
  };
  // Load the open DBA's member-tier assignments (they live in its chat config)
  useEffect(() => {
    setDbaTiers({}); setPromoteFor(''); setChannels(null);
    setDbaDaily(null); setDbaDailyIn(''); setDbaDailyMsg('');
    dbaDailyReq.current = '';
    if (!openId) return;
    loadDbaDaily(openId);
    fetch(`${BASE}api/dba/chat-config?id=${encodeURIComponent(openId)}`, { headers: { Authorization: sbBearer() } })
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (b?.ok) { setDbaTiers(b.tiers || {}); setChannels(Array.isArray(b.channels) ? b.channels : []); } else setChannels([]); })
      .catch(() => setChannels([]));
  }, [openId]);

  const post = async (path: string, body: any) => {
    setBusy(true); setErr(''); setNotice('');
    try {
      const r = await fetch(`${BASE}api/dba/${path}`, { method: 'POST', headers: hdrs(), body: JSON.stringify(hqOrgId ? { ...body, orgId: hqOrgId } : body) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(b?.error || "Couldn't save — try again."); return null; }
      await reload();
      return b;
    } catch { setErr("Couldn't reach the server — try again."); return null; }
    finally { setBusy(false); }
  };

  if (!st.loading && !st.allowed) {
    // Plan doesn't include DBAs — hidden for org admins; HQ gets an explanation
    return hqOrgId
      ? <p style={{ fontSize: 12, color: B.muted, margin: 0 }}>This organization's plan doesn't include DBAs. You can change which plans include them in the packages editor.</p>
      : null;
  }
  const accent = org.brand_color || B.gold;
  const linkFor = (d: any) => `${window.location.origin}${BASE.replace(/\/+$/, '')}/${d.slug}`;
  const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  const Wrap = hqOrgId ? ('div' as any) : Card; // HQ picker already provides the outer card
  return (
    <Wrap style={hqOrgId ? {} : { marginBottom: 20, borderLeft: `3px solid ${accent}` }}>
      {!hqOrgId && <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: 1, textTransform: "uppercase", margin: "0 0 6px" }}>🏷 Your DBAs (Sub-Brands)</p>}
      <p style={{ fontSize: 12, color: B.muted, margin: "0 0 12px", lineHeight: 1.5 }}>
        Run additional brands under {org.name} — each with its own name, colors, coach and member login link. Members you invite here only see that DBA's space, not your main app.
      </p>
      {st.loading ? <p style={{ fontSize: 12, color: B.muted, margin: 0 }}>Loading…</p> : (
        <>
          {st.dbas.map((d: any) => (
            <div key={d.id} style={{ border: `1px solid ${B.border}`, borderLeft: `3px solid ${d.brand_color || accent}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10, opacity: d.is_active ? 1 : 0.55 }}>
              <div onClick={() => { setOpenId(openId === d.id ? null : d.id); setMemberDraft({ name: '', email: '' }); setErr(''); setNotice(''); }}
                style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", cursor: "pointer" }}
                title={openId === d.id ? 'Collapse' : 'Expand to manage this DBA'}>
                <span style={{ fontSize: 12, color: openId === d.id ? accent : B.muted, width: 12, display: "inline-block", transition: "transform .15s", transform: openId === d.id ? 'rotate(90deg)' : 'none' }}>▶</span>
                <OrgLogo org={d} size={30} />
                <div style={{ flex: 1, minWidth: 140 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: B.text, margin: 0 }}>{d.name}{!d.is_active && <span style={{ fontSize: 10, color: "#ffa600", fontWeight: 700 }}> · ARCHIVED</span>}</p>
                  <p style={{ fontSize: 10, color: B.muted, margin: 0 }}>
                    /{d.slug} · {d.coach_name ? `Coach: ${d.coach_name}` : 'No coach yet'} · {d.members.length} member{d.members.length === 1 ? '' : 's'}
                    {(d.delegates || []).length > 0 && ` · ${(d.delegates || []).length} staff`}
                  </p>
                </div>
              </div>
              {openId === d.id && (
                <div style={{ marginTop: 10, borderTop: `1px solid ${B.border}`, paddingTop: 10 }}>
                  {/* Quick actions */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    <button onClick={async () => {
                        try { await navigator.clipboard.writeText(linkFor(d)); } catch {}
                        setCopiedId(d.id); setTimeout(() => setCopiedId(''), 2000);
                      }}
                      style={{ background: copiedId === d.id ? B.success : "none", color: copiedId === d.id ? "#000" : B.text, border: `1px solid ${B.border}`, borderRadius: 7, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {copiedId === d.id ? "✓ Copied" : "Copy Link"}
                    </button>
                    <button onClick={() => window.open(linkFor(d), '_blank')}
                      title="Jump into this DBA's space (opens in a new tab — you're a manager there)"
                      style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}55`, borderRadius: 7, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      Open DBA ↗
                    </button>
                    <button onClick={() => { setForm({ id: d.id, name: d.name, slug: d.slug, coachId: d.coach_id || '', brandColor: d.brand_color || '#ffa600', brandColors: Array.isArray(d.brand_colors) ? d.brand_colors.filter((c:any)=>typeof c==='string') : [], logoUrl: d.logo_url || '' }); setErr(''); setNotice(''); }}
                      style={{ background: "none", color: B.text, border: `1px solid ${B.border}`, borderRadius: 7, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      Edit
                    </button>
                    <button disabled={busy} onClick={() => post('archive', { id: d.id, active: !d.is_active })}
                      style={{ background: "none", color: d.is_active ? "#e05a5a" : B.success, border: `1px solid ${B.border}`, borderRadius: 7, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {d.is_active ? 'Archive' : 'Restore'}
                    </button>
                  </div>
                  {/* Coach assignment */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: B.muted, letterSpacing: 0.6, textTransform: "uppercase" }}>Coach</span>
                    <select disabled={busy} value={d.coach_id || ''}
                      onChange={e => post('save', { id: d.id, name: d.name, slug: d.slug, coachId: e.target.value, brandColor: d.brand_color || '#ffa600', logoUrl: d.logo_url || '' })}
                      style={{ background: B.dim, color: B.text, border: `1px solid ${B.border}`, borderRadius: 6, padding: "4px 8px", fontSize: 11, outline: "none" }}>
                      <option value="">No coach assigned yet</option>
                      {coaches.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.role === 'super_admin' ? ' (admin)' : ''}</option>)}
                    </select>
                    {channels !== null && (
                      <span style={{ fontSize: 11, color: B.muted }}>
                        · Channels: {channels.length ? channels.map((ch: any) => `#${ch.name}`).join('  ') : 'none yet'}
                      </span>
                    )}
                  </div>
                  {/* Staff / VA delegation */}
                  {staff.length > 0 && (
                    <div style={{ border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: B.muted, letterSpacing: 0.6, textTransform: "uppercase", margin: "0 0 4px" }}>Staff access</p>
                      <p style={{ fontSize: 10, color: B.muted, margin: "0 0 6px", lineHeight: 1.5 }}>Give a teammate or VA management access to this DBA — they can run its chat, huddles, calendar and members just like the coach. Untick to take it back instantly.</p>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {staff.map((s: any) => {
                          const isCoachHere = d.coach_id === s.id;
                          const granted = isCoachHere || (d.delegates || []).some((g: any) => g.id === s.id);
                          return (
                            <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: granted ? B.text : B.muted, cursor: isCoachHere ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                              <input type="checkbox" checked={granted} disabled={busy || isCoachHere}
                                onChange={e => post('delegate-set', { dbaId: d.id, userId: s.id, allowed: e.target.checked })}
                                style={{ accentColor: accent }} />
                              {s.name}{isCoachHere ? ' (coach)' : s.role === 'va' ? ' (VA)' : ''}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Per-DBA Daily.co (video calls) */}
                  <div style={{ border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: B.muted, letterSpacing: 0.6, textTransform: "uppercase", margin: "0 0 4px" }}>🎥 Video Calls (Daily.co)</p>
                    {dbaDaily === null ? (
                      <p style={{ fontSize: 11, color: B.muted, margin: 0 }}>Checking connection…</p>
                    ) : dbaDaily.source === 'dba' ? (
                      <>
                        <p style={{ fontSize: 11, color: B.success || '#4FD89A', margin: "0 0 6px", lineHeight: 1.5 }}>✅ This DBA runs calls on its own Daily.co account.</p>
                        <button disabled={busy} onClick={async () => {
                            if (!window.confirm(`Disconnect ${d.name}'s own Daily.co account? Calls will fall back to the organization's account (if connected).`)) return;
                            const b = await post('daily-key-remove', { dbaId: d.id });
                            if (b) { setDbaDailyMsg(''); loadDbaDaily(d.id); }
                          }}
                          style={{ background: "none", color: "#e05a5a", border: `1px solid ${B.border}`, borderRadius: 7, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <>
                        <p style={{ fontSize: 11, color: B.muted, margin: "0 0 6px", lineHeight: 1.6 }}>
                          {dbaDaily.source === 'org'
                            ? 'Calls currently run on the organization\u2019s Daily.co account. Give this DBA its own account to keep its call minutes and billing separate:'
                            : 'No video account connected yet — huddles here won\u2019t work until one is. Connect a free Daily.co account for this DBA:'}
                          <br/>1. Sign up at <a href="https://dashboard.daily.co/signup" target="_blank" rel="noopener noreferrer" style={{ color: accent }}>dashboard.daily.co</a> (free — 1,000 call minutes/month)
                          <br/>2. Open <strong>Developers</strong> in the left menu, copy the API key, paste it here:
                        </p>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <input type="password" value={dbaDailyIn} onChange={e => setDbaDailyIn(e.target.value)}
                            placeholder="Paste the Daily.co API key"
                            style={{ flex: 1, minWidth: 180, background: B.dim, border: `1px solid ${B.border}`, borderRadius: 7, padding: "6px 10px", color: B.text, fontSize: 11, outline: "none" }}/>
                          <button disabled={busy || !dbaDailyIn.trim()} onClick={async () => {
                              setDbaDailyMsg('');
                              const b = await post('daily-key', { dbaId: d.id, key: dbaDailyIn.trim() });
                              if (b) { setDbaDailyIn(''); setDbaDailyMsg('✅ Connected — this DBA now runs calls on its own account.'); loadDbaDaily(d.id); }
                            }}
                            style={{ background: accent, color: "#000", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer", opacity: (busy || !dbaDailyIn.trim()) ? 0.5 : 1 }}>
                            {busy ? 'Checking…' : 'Connect'}
                          </button>
                        </div>
                      </>
                    )}
                    {dbaDailyMsg && <p style={{ fontSize: 11, color: '#4FD89A', margin: "6px 0 0" }}>{dbaDailyMsg}</p>}
                  </div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: B.muted, letterSpacing: 0.6, textTransform: "uppercase", margin: "0 0 4px" }}>Members</p>
                  {d.members.length === 0 && <p style={{ fontSize: 11, color: B.muted, margin: "0 0 8px" }}>No members yet — invite the first one below. They'll get an email with their login details and the {d.name} link.</p>}
                  {d.members.map((m: any) => (
                    <div key={m.email} style={{ padding: "5px 0", borderBottom: `1px solid ${B.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ flex: 1, minWidth: 150, fontSize: 12, color: B.text, fontWeight: 600 }}>
                          {m.name} <span style={{ color: B.muted, fontWeight: 400 }}>· {m.email}</span>
                          {m.pure === false && <span style={{ fontSize: 9, color: B.success || '#4FD89A', fontWeight: 700 }}> · FULL CLIENT</span>}
                        </span>
                        {tierDefs.length > 0 && (
                          <select disabled={busy} value={dbaTiers[m.id] || tierDefs[0]?.id || ''} title="Membership tier"
                            onChange={async e => {
                              const tid = e.target.value;
                              const b = await post('tier-set', { dbaId: d.id, userId: m.id, tierId: tid });
                              if (b) setDbaTiers((p: any) => ({ ...p, [m.id]: tid }));
                            }}
                            style={{ background: B.dim, color: B.text, border: `1px solid ${B.border}`, borderRadius: 6, padding: "3px 6px", fontSize: 10, outline: "none" }}>
                            {tierDefs.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        )}
                        {m.pure !== false && (
                          <button disabled={busy} onClick={() => { setPromoteFor(promoteFor === m.id ? '' : m.id); }}
                            title="Turn them into a full client of your app (they keep this DBA)"
                            style={{ background: promoteFor === m.id ? `${accent}22` : "none", color: accent, border: `1px solid ${promoteFor === m.id ? accent : B.border}`, borderRadius: 6, padding: "3px 9px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                            Promote
                          </button>
                        )}
                        <button disabled={busy} onClick={() => { if (confirm(`Remove ${m.name} from ${d.name}? Their login stays — they just lose access to this DBA.`)) post('member-remove', { dbaId: d.id, email: m.email }); }}
                          style={{ background: "none", color: "#e05a5a", border: `1px solid ${B.border}`, borderRadius: 6, padding: "3px 9px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                          Remove
                        </button>
                      </div>
                      {promoteFor === m.id && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: B.muted }}>Make {m.name} a full client under:</span>
                          <select defaultValue="" disabled={busy}
                            onChange={async e => {
                              const cid = e.target.value; if (!cid) return;
                              const cName = coaches.find((c: any) => c.id === cid)?.name || 'this coach';
                              if (!confirm(`Promote ${m.name} to a full client under ${cName}? They keep their ${d.name} membership and get the full app on their next login.`)) { e.target.value = ''; return; }
                              const b = await post('promote', { dbaId: d.id, userId: m.id, coachId: cid });
                              if (b) { setPromoteFor(''); setNotice(`✅ ${m.name} is now a full client under ${b.coach?.name || cName}.`); }
                            }}
                            style={{ background: B.dim, color: B.text, border: `1px solid ${B.border}`, borderRadius: 6, padding: "4px 8px", fontSize: 11, outline: "none" }}>
                            <option value="">Pick a coach…</option>
                            {coaches.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.role === 'super_admin' ? ' (admin)' : ''}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <input value={memberDraft.name} onChange={e => setMemberDraft(p => ({ ...p, name: e.target.value }))} placeholder="Full name"
                      style={{ flex: 1, minWidth: 120, background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 10px", color: B.text, fontSize: 12, outline: "none" }} />
                    <input value={memberDraft.email} onChange={e => setMemberDraft(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com"
                      style={{ flex: 1.4, minWidth: 160, background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 10px", color: B.text, fontSize: 12, outline: "none" }} />
                    <button disabled={busy || !memberDraft.name.trim() || !memberDraft.email.trim()}
                      onClick={async () => {
                        const b = await post('member-add', { dbaId: d.id, name: memberDraft.name.trim(), email: memberDraft.email.trim() });
                        if (b) { setMemberDraft({ name: '', email: '' }); setNotice(b.emailed ? `✅ Invited — login details emailed to ${b.dba ? memberDraft.email.trim().toLowerCase() : ''}` : '⚠ Added, but the invite email could not be sent — resend from the Invites screen.'); }
                      }}
                      style={{ background: accent, color: "#000", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
                      {busy ? 'Working…' : 'Invite Member'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {form ? (
            <div style={{ border: `1px dashed ${B.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: B.muted, letterSpacing: 0.6, textTransform: "uppercase", margin: "0 0 8px" }}>{form.id ? 'Edit DBA' : 'New DBA'}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                <div style={{ flex: 1.4, minWidth: 160 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: B.muted, margin: "0 0 3px" }}>Display name — shown everywhere in the app</p>
                  <input value={form.name} onChange={e => setForm((p: any) => ({ ...p, name: e.target.value, slug: p.id || p.slugTouched ? p.slug : slugify(e.target.value) }))} placeholder="e.g. Lifestyle of Eden University"
                    style={{ width: "100%", boxSizing: "border-box", background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 10px", color: B.text, fontSize: 12, outline: "none" }} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: B.muted, margin: "0 0 3px" }}>Link name — only for the web address</p>
                  <input value={form.slug} onChange={e => setForm((p: any) => ({ ...p, slug: slugify(e.target.value), slugTouched: true }))} placeholder="e.g. leu"
                    style={{ width: "100%", boxSizing: "border-box", background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 10px", color: B.text, fontSize: 12, outline: "none", fontFamily: "monospace" }} />
                </div>
              </div>
              {form.slug ? <p style={{ fontSize: 10, color: B.muted, margin: "0 0 8px" }}>Members will log in at <span style={{ fontFamily: "monospace", color: B.text }}>edencommunications.io/{form.slug}</span> — keep it short. The login page itself shows the full display name.</p> : <div style={{ marginBottom: 8 }} />}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                <select value={form.coachId} onChange={e => setForm((p: any) => ({ ...p, coachId: e.target.value }))}
                  style={{ flex: 1, minWidth: 150, background: B.dim, color: B.text, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, outline: "none" }}>
                  <option value="">No coach assigned yet</option>
                  {coaches.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.role === 'super_admin' ? ' (admin)' : ''}</option>)}
                </select>
              </div>
              {/* Brand colors — same controls as the org branding editor */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: B.muted, letterSpacing: 0.6, textTransform: "uppercase", width: 60, flexShrink: 0 }}>Primary</span>
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test((form.brandColor||'').trim()) ? form.brandColor.trim() : '#ffa600'}
                  onChange={e => setForm((p: any) => ({ ...p, brandColor: e.target.value }))}
                  style={{ width: 40, height: 34, padding: 2, background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, cursor: "pointer" }} />
                <input value={form.brandColor} onChange={e => setForm((p: any) => ({ ...p, brandColor: e.target.value }))}
                  placeholder="#ffa600" maxLength={7}
                  style={{ width: 90, background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 10px", color: B.text, fontSize: 12, outline: "none", fontFamily: "monospace" }} />
              </div>
              {(form.brandColors || []).map((c: string, i: number) => (
                <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: B.muted, letterSpacing: 0.6, textTransform: "uppercase", width: 60, flexShrink: 0 }}>Color {i + 2}</span>
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test((c||'').trim()) ? c.trim() : '#888888'}
                    onChange={e => setForm((p: any) => ({ ...p, brandColors: p.brandColors.map((v: string, j: number) => j === i ? e.target.value : v) }))}
                    style={{ width: 40, height: 34, padding: 2, background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, cursor: "pointer" }} />
                  <input value={c} onChange={e => setForm((p: any) => ({ ...p, brandColors: p.brandColors.map((v: string, j: number) => j === i ? e.target.value : v) }))}
                    placeholder="#6FB8E8" maxLength={7}
                    style={{ width: 90, background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 10px", color: B.text, fontSize: 12, outline: "none", fontFamily: "monospace" }} />
                  <button onClick={() => setForm((p: any) => ({ ...p, brandColors: p.brandColors.filter((_: any, j: number) => j !== i) }))}
                    style={{ background: "none", color: "#e05a5a", border: `1px solid #e05a5a44`, borderRadius: 8, padding: "7px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    Remove
                  </button>
                </div>
              ))}
              {(form.brandColors || []).length < 5 && (
                <button onClick={() => setForm((p: any) => ({ ...p, brandColors: [...(p.brandColors || []), '#6FB8E8'] }))}
                  style={{ background: B.card, color: B.text, border: `1px solid ${B.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
                  + Add Palette Color
                </button>
              )}
              {/* Logo — paste a URL or upload an image (same flow as org logos) */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                <OrgLogo org={{ name: form.name || 'DBA', brand_color: /^#[0-9a-fA-F]{6}$/.test((form.brandColor||'').trim()) ? form.brandColor.trim() : '#ffa600', logo_url: form.logoUrl || null }} size={38} />
                <input value={(form.logoUrl || '').startsWith('data:') ? '(uploaded image)' : form.logoUrl} readOnly={(form.logoUrl || '').startsWith('data:')}
                  onChange={e => { setForm((p: any) => ({ ...p, logoUrl: e.target.value })); setLogoErr(''); }} placeholder="Logo URL (optional) — or upload →"
                  style={{ flex: 1.4, minWidth: 160, background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 10px", color: B.text, fontSize: 12, outline: "none" }} />
                <button onClick={() => logoFileRef.current?.click()} disabled={logoBusy}
                  style={{ background: B.card, color: B.text, border: `1px solid ${B.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: logoBusy ? "wait" : "pointer", opacity: logoBusy ? 0.6 : 1 }}>
                  {logoBusy ? 'Uploading…' : 'Upload Image…'}
                </button>
                {form.logoUrl && (
                  <button onClick={() => { setForm((p: any) => ({ ...p, logoUrl: '' })); setLogoErr(''); }}
                    style={{ background: "none", color: "#e05a5a", border: `1px solid #e05a5a44`, borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    Remove
                  </button>
                )}
                <input ref={logoFileRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => { onLogoFile(e.target.files?.[0] || null); e.target.value = ''; }} />
              </div>
              {logoErr && <p style={{ fontSize: 11, color: "#e05a5a", margin: "0 0 8px" }}>{logoErr}</p>}
              <p style={{ fontSize: 10, color: B.muted, margin: "0 0 8px" }}>Login link will be: <code style={{ color: accent }}>{window.location.origin}{BASE.replace(/\/+$/, '')}/{form.slug || '…'}</code></p>
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={busy || logoBusy || !form.name.trim()}
                  onClick={async () => {
                    const primary = (form.brandColor || '').trim();
                    if (primary && !/^#[0-9a-fA-F]{6}$/.test(primary)) { setErr('Primary color must be a 6-digit hex value like #ffa600.'); return; }
                    const extras = (form.brandColors || []).map((c: string) => (c || '').trim()).filter(Boolean);
                    if (extras.some((c: string) => !/^#[0-9a-fA-F]{6}$/.test(c))) { setErr('Palette colors must be 6-digit hex values like #6FB8E8.'); return; }
                    const b = await post('save', { id: form.id, name: form.name.trim(), slug: form.slug, coachId: form.coachId, brandColor: primary, brandColors: extras, logoUrl: form.logoUrl });
                    if (b) { setForm(null); setNotice('✅ Saved'); setTimeout(() => setNotice(''), 2500); }
                  }}
                  style={{ background: accent, color: "#000", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
                  {busy ? 'Saving…' : form.id ? 'Save Changes' : 'Create DBA'}
                </button>
                <button onClick={() => { setForm(null); setErr(''); }}
                  style={{ background: "none", color: B.muted, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setForm({ name: '', slug: '', coachId: '', brandColor: '#ffa600', brandColors: [], logoUrl: '' }); setErr(''); setNotice(''); }}
              style={{ background: "none", color: accent, border: `1px dashed ${accent}66`, borderRadius: 10, padding: "10px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", width: "100%" }}>
              + New DBA
            </button>
          )}
          {canEditTiers && tierDefs.length > 0 && (
            <div style={{ border: `1px solid ${B.border}`, borderRadius: 10, padding: 12, marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <p style={{ flex: 1, fontSize: 11, fontWeight: 700, color: B.muted, letterSpacing: 0.6, textTransform: "uppercase", margin: 0 }}>Membership tiers (all DBAs)</p>
                {!tierDraft && (
                  <button onClick={() => setTierDraft(tierDefs.map((t: any) => ({ ...t })))}
                    style={{ background: "none", color: accent, border: `1px solid ${B.border}`, borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Edit</button>
                )}
              </div>
              <p style={{ fontSize: 10, color: B.muted, margin: "0 0 8px", lineHeight: 1.5 }}>
                Every tier includes all of a DBA's group chats. Higher tiers can add 1-on-1 messaging and full app access.
              </p>
              {!tierDraft ? (
                tierDefs.map((t: any) => (
                  <p key={t.id} style={{ fontSize: 12, color: B.text, margin: "3px 0" }}>
                    <b>{t.name}</b> <span style={{ color: B.muted, fontSize: 10 }}>— group chats{t.dm ? ' + 1-on-1 messages' : ''}{t.app ? ' + full app access' : ''}</span>
                  </p>
                ))
              ) : (
                <>
                  {tierDraft.map((t: any, i: number) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <input value={t.name} onChange={e => setTierDraft(p => (p || []).map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        style={{ flex: 1, minWidth: 120, background: B.dim, border: `1px solid ${B.border}`, borderRadius: 8, padding: "6px 10px", color: B.text, fontSize: 12, outline: "none" }} />
                      <label style={{ fontSize: 10, color: B.muted, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                        <input type="checkbox" checked={!!t.dm} onChange={e => setTierDraft(p => (p || []).map((x, j) => j === i ? { ...x, dm: e.target.checked } : x))} /> 1-on-1s
                      </label>
                      <label style={{ fontSize: 10, color: B.muted, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                        <input type="checkbox" checked={!!t.app} onChange={e => setTierDraft(p => (p || []).map((x, j) => j === i ? { ...x, app: e.target.checked } : x))} /> Full app
                      </label>
                      {tierDraft.length > 1 && (
                        <button onClick={() => setTierDraft(p => (p || []).filter((_, j) => j !== i))}
                          style={{ background: "none", color: "#e05a5a", border: "none", fontSize: 12, cursor: "pointer", padding: 2 }}>✕</button>
                      )}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    {tierDraft.length < 6 && (
                      <button onClick={() => setTierDraft(p => [...(p || []), { id: `t${Date.now().toString(36)}`, name: `Tier ${(p || []).length + 1}`, dm: true, app: false }])}
                        style={{ background: "none", color: accent, border: `1px dashed ${accent}66`, borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ Add tier</button>
                    )}
                    <div style={{ flex: 1 }} />
                    <button onClick={() => setTierDraft(null)}
                      style={{ background: "none", color: B.muted, border: `1px solid ${B.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 11, cursor: "pointer" }}>Cancel</button>
                    <button disabled={busy || tierDraft.some((t: any) => !t.name.trim())}
                      onClick={async () => {
                        const b = await post('tier-defs', { defs: tierDraft });
                        if (b) { setTierDefs(b.defs || tierDraft); setTierDraft(null); setNotice('✅ Tier ladder saved'); setTimeout(() => setNotice(''), 2500); }
                      }}
                      style={{ background: accent, color: "#000", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 11, fontWeight: 800, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
                      {busy ? 'Saving…' : 'Save tiers'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {err && <p style={{ fontSize: 11, color: "#e05a5a", margin: "8px 0 0" }}>{err}</p>}
          {notice && <p style={{ fontSize: 11, color: notice.startsWith('✅') ? (B.success || '#4FD89A') : '#ffa600', margin: "8px 0 0" }}>{notice}</p>}
        </>
      )}
    </Wrap>
  );
};

// ─── ROOT ─────────────────────────────────────────────────────────────────────
import { useRoute } from "wouter";
import { VideoTemplate } from "./components/video/VideoTemplate";

export default function App() {
  const [matchVideo] = useRoute("/video");

  const [user, setUser] = useState<any>(null);
  const [authScreen, setAuthScreen] = useState("login");

  if (matchVideo) {
    return <VideoTemplate />;
  }


  // Password-recovery link landing: the emailed reset link signs the visitor
  // in with a temporary recovery session — show the "choose a new password"
  // screen instead of the login form.
  const [recovery, setRecovery] = useState(() => /type=recovery/.test(window.location.hash));
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const fullLogout = () => {
    setUser(null);
    supabase.auth.signOut().catch(()=>{});
  };

  // Automated welcome message: after a client signs in, ask the server once
  // whether their one-time welcome should be dropped into their coach chat.
  // The server keeps its own "already sent" ledger — this is just the nudge.
  useEffect(() => {
    if (user?.role !== 'client' || !user?.email) return;
    const key = `welcomeChecked:${user.email}`;   // per-user, so shared browsers can't suppress each other
    if (sessionStorage.getItem(key)) return;
    fetch('/api/welcome/check', { method:'POST', headers:{ Authorization: sbBearer() } })
      .then(r => { if (r.ok) sessionStorage.setItem(key, '1'); }) // only mark done on success — transient failures retry next load
      .catch(()=>{});
  }, [user?.role, user?.email]);

  // Branded login link: ?org=<slug> or a subpath like /my-org loads that org's
  // name + palette before auth. Plain visits keep brandOrg = null → Eden gold login.
  const [brandOrg, setBrandOrg] = useState<any>(null);
  useEffect(() => { (async () => {
    try {
      // DBA branding: a sub-brand's slug can arrive as ?dba=<slug>, or as a
      // subpath that isn't an org slug (checked below as the fallback).
      const dbaParam = new URLSearchParams(window.location.search).get('dba');
      const loadDba = async (s: string) => {
        try {
          const r = await fetch(`${(import.meta.env.BASE_URL || '/')}api/dba/brand?slug=${encodeURIComponent(s)}`);
          if (!r.ok) return false;
          const b = await r.json();
          if (b?.dba) { setBrandOrg(b.dba); return true; }
        } catch {}
        return false;
      };
      if (dbaParam && await loadDba(dbaParam.toLowerCase())) return;
      let slug = new URLSearchParams(window.location.search).get('org');
      if (!slug) {
        // Subpath form: first path segment is treated as an org slug
        // (reserved app routes excluded). Unknown slugs fall back to Eden login.
        const RESERVED = new Set(['video', 'api', '__mockup']);
        // Base-path aware: strip the app's mount path before reading the slug segment
        const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
        const path = window.location.pathname.startsWith(base)
          ? window.location.pathname.slice(base.length) : window.location.pathname;
        const seg = (path.split('/').filter(Boolean)[0] || '').toLowerCase();
        if (seg && !RESERVED.has(seg) && /^[a-z0-9][a-z0-9-]*$/.test(seg)) slug = seg;
      }
      if (!slug) return;
      const rows = await sbGet('organizations',
        `slug=eq.${encodeURIComponent(slug.toLowerCase())}&select=id,name,slug,brand_color,logo_url,is_white_label,is_active&limit=1`);
      const org = Array.isArray(rows) ? rows[0] : null;
      // Not an org slug → maybe a DBA slug (sub-brand); unknown → Eden default
      if (!org || org.is_active === false) { await loadDba(slug.toLowerCase()); return; }
      // Palette column added later — fetch separately so a missing column can't break primary branding
      let full = org;
      const pal = await sbGet('organizations', `id=eq.${org.id}&select=brand_colors&limit=1`);
      if (Array.isArray(pal?.[0]?.brand_colors)) full = { ...org, brand_colors: pal[0].brand_colors };
      setBrandOrg(full);
    } catch {}
  })() }, []);

  // DBA memberships: dba_member accounts live in their DBA space instead of
  // the app; regular users who arrive via a DBA link get the DBA space first
  // with an "Open the full app" exit.
  const isDbaMember = user?.role === 'dba_member' || user?.dbaMember === true;
  const cameViaDba = !!brandOrg?.__dba;
  const [myDbas, setMyDbas] = useState<any[] | null>(null);
  const [dbaExited, setDbaExited] = useState(false);
  // Staff who exit a DBA back into the main app: restore the Eden install target
  useEffect(() => { if (dbaExited) resetPwaBrand(); }, [dbaExited]);
  // Staff can flip into their DBA space from inside the app (top-bar button)
  const [dbaEntered, setDbaEntered] = useState(false);
  useEffect(() => {
    // Load DBA memberships for everyone — members need it to land in their
    // space, and coaches/admins need it for the in-app "My DBAs" switch.
    if (!user?.email || user.mustChangePassword) return;
    fetch(`${(import.meta.env.BASE_URL || '/')}api/dba/mine`, { headers: { Authorization: sbBearer() } })
      .then(r => (r.ok ? r.json() : null))
      .then(b => setMyDbas(Array.isArray(b?.dbas) ? b.dbas : []))
      .catch(() => setMyDbas([]));
  }, [user?.email, user?.mustChangePassword, isDbaMember, cameViaDba]);

  if (!user) {
    if (recovery) return <SetPasswordScreen mode="recovery"
      onDone={()=>{ setRecovery(false); supabase.auth.signOut().catch(()=>{}); try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch {} }}
      onCancel={()=>{ setRecovery(false); supabase.auth.signOut().catch(()=>{}); try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch {} }}/>;
    if (authScreen === "forgot") return <ForgotScreen onBack={()=>setAuthScreen("login")}/>;
    return <LoginScreen onLogin={setUser} onForgot={()=>setAuthScreen("forgot")} brandOrg={brandOrg}/>;
  }

  // First sign-in with a temporary password — force setting a personal one
  if (user.mustChangePassword) {
    return <SetPasswordScreen mode="first"
      onDone={()=>setUser({ ...user, mustChangePassword: false })}
      onCancel={fullLogout}/>;
  }

  // DBA members land in their DBA space (never the main app). Regular users
  // arriving via a DBA link see the DBA space first with a way into the app.
  if (isDbaMember || (cameViaDba && !dbaExited) || dbaEntered) {
    if (myDbas === null) {
      return (
        <div style={{ minHeight: "100vh", background: B.black, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: B.muted, fontSize: 13 }}>Loading your space…</p>
        </div>
      );
    }
    if (myDbas.length > 0) {
      return <DbaHome user={user} dbas={myDbas}
        initialSlug={cameViaDba ? brandOrg.slug : null}
        onEnterApp={isDbaMember ? null : () => { setDbaExited(true); setDbaEntered(false); }}
        onLogout={fullLogout}/>;
    }
    if (dbaEntered) setDbaEntered(false); // entered but no DBAs (revoked) — fall through to the app
    if (isDbaMember) {
      return (
        <div style={{ minHeight: "100vh", background: B.black, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center" }}>
          <p style={{ color: B.text, fontSize: 15, fontWeight: 700, margin: 0 }}>Your membership isn't active yet</p>
          <p style={{ color: B.muted, fontSize: 12, margin: 0, maxWidth: 360, lineHeight: 1.6 }}>Your login works, but you're not part of an active group right now. Please contact the person who invited you.</p>
          <button onClick={fullLogout} style={{ background: "none", color: B.muted, border: `1px solid ${B.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 12, cursor: "pointer" }}>Log out</button>
        </div>
      );
    }
    // came via a DBA link but isn't a member → straight into the app
  }

  return (
    <AuthContext.Provider value={{ user, logout: fullLogout }}>
      <AppShell user={user} onLogout={fullLogout}
        myDbas={user.role === 'client' ? [] : (myDbas || [])}
        onOpenDba={() => { setDbaExited(false); setDbaEntered(true); }}/>
      <InstallBanner />
    </AuthContext.Provider>
  );
}
