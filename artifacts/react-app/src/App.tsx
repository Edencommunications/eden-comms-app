import { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";
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
import Week4 from "./components/Week4";
import Week5 from "./components/Week5";
import Week6 from "./components/Week6";
import Week7 from "./components/Week7";
import Wearables from "./components/Wearables";
import InstallBanner from "./components/InstallBanner";

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

// ─── AUTH CONTEXT ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

// ─── DEMO USERS (replace with Supabase auth) ──────────────────────────────────
const DEMO_USERS = {
  "admin@edencomms.io":   { password: "Admin1234!", role: "super_admin",  name: "Eden Admin",      org: "eden" },
  "coach@eden.io":        { password: "Coach1234!", role: "coach",        name: "Coach Marcus",    org: "eden" },
  "client@eden.io":       { password: "Client123!", role: "client",       name: "Jordan Williams", org: "eden", coach: "coach@eden.io" },
  "va@eden.io":           { password: "VA1234!",    role: "va",           name: "Sarah (VA)",      org: "eden" },
  "headcoach@eden.io":    { password: "HC1234!",    role: "head_coach",   name: "Head Coach Nia",  org: "eden" },
  "coach@partnerbrand.io":{ password: "Coach1234!", role: "coach",        name: "Coach Rivera",    org: "partner_brand" },
};

// ─── ICONS ───────────────────────────────────────────────────────────────────
// @ts-nocheck
const Ic = ({ n, size = 20, s, c = B.muted }) => {
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
      alt="Lifestyle of Eden"
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

// LOGIN
const LoginScreen = ({ onLogin, onForgot, onSignup }) => {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = () => {
    setError("");
    if (!email || !pass) { setError("Please enter your email and password."); return; }
    setLoading(true);
    setTimeout(() => {
      const user = DEMO_USERS[email.toLowerCase()];
      if (user && user.password === pass) {
        onLogin({ email, ...user });
      } else {
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
        <div style={{ background:`linear-gradient(160deg, #1a1200 0%, #000000 100%)`, padding:"32px 20px 24px", display:"flex", flexDirection:"column", alignItems:"center", borderBottom:`1px solid #1a1a1a` }}>
          <EdenLogo size={72}/>
          <h1 style={{ fontSize:22, fontWeight:800, color:"#ffffff", margin:"16px 0 4px", textAlign:"center" }}>Eden Communications</h1>
          <p style={{ fontSize:12, color:"#888888", margin:0, textAlign:"center" }}>The private platform for Lifestyle of Eden coaches and clients</p>
        </div>
      ) : (
        <div style={{ flex:1, background:`linear-gradient(160deg, #1a1200 0%, #000000 100%)`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40, borderRight:`1px solid #1a1a1a`, minWidth:0 }}>
          <EdenLogo size={110}/>
          <h1 style={{ fontSize:32, fontWeight:800, color:"#ffffff", margin:"24px 0 8px", textAlign:"center", lineHeight:1.2 }}>
            Eden<br/>Communications
          </h1>
          <p style={{ fontSize:14, color:"#888888", margin:"0 0 32px", textAlign:"center", lineHeight:1.6 }}>
            The private platform for<br/>Lifestyle of Eden coaches and clients
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:10, width:"100%", maxWidth:260 }}>
            {["🔒 HIPAA-grade encryption","🛡 End-to-end secure messaging","📊 Full client management","🍽 Diet builder + macro tracking"].map(f => (
              <div key={f} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:"#ffa60011", borderRadius:8, border:"1px solid #ffa60022" }}>
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
            <button onClick={onForgot} style={{ background:"none", border:"none", cursor:"pointer", color:B.gold, fontSize:12, padding:0, marginBottom:20, display:"block", textAlign:"right", width:"100%" }}>
              Forgot password?
            </button>
            <Btn onClick={submit} fullWidth disabled={loading}>
              {loading ? "Signing in…" : "Sign In →"}
            </Btn>
          </Card>

          <p style={{ textAlign:"center", fontSize:13, color:B.muted, marginTop:20 }}>
            New client?{" "}
            <button onClick={onSignup} style={{ background:"none", border:"none", cursor:"pointer", color:B.gold, fontSize:13, fontWeight:600, padding:0 }}>Request Access</button>
          </p>

          {/* Demo credentials helper */}
          <div style={{ marginTop:28, padding:"12px 14px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10 }}>
            <p style={{ fontSize:10, fontWeight:700, color:B.gold, margin:"0 0 8px", letterSpacing:1 }}>DEMO LOGINS</p>
            {[
              ["Super Admin","admin@edencomms.io","Admin1234!"],
              ["Coach","coach@eden.io","Coach1234!"],
              ["Client","client@eden.io","Client123!"],
            ].map(([role,em,pw])=>(
              <button key={role} onClick={()=>{setEmail(em);setPass(pw);}}
                style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", cursor:"pointer", padding:"4px 0" }}>
                <span style={{ fontSize:11, color:B.muted }}><span style={{ color:B.gold, fontWeight:600 }}>{role}:</span> {em}</span>
              </button>
            ))}
          </div>

          <p style={{ textAlign:"center", fontSize:10, color:"#444444", marginTop:20, lineHeight:1.6 }}>
            🔒 All data encrypted · HIPAA compliant · edencommunications.io
          </p>
        </div>
      </div>
    </div>
  );
};

// FORGOT PASSWORD
const ForgotScreen = ({ onBack }) => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
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
              <Input label="Email Address" type="email" value={email} onChange={setEmail} placeholder="you@example.com" icon={<Ic n="mail" size={16} c={B.muted}/>}/>
              <Btn onClick={()=>setSent(true)} fullWidth disabled={!email}>Send Reset Link</Btn>
            </>
          ) : (
            <div style={{ textAlign:"center", padding:"12px 0" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>✉️</div>
              <h3 style={{ color:B.text, fontSize:16, marginBottom:8 }}>Check your inbox</h3>
              <p style={{ fontSize:13, color:B.muted, lineHeight:1.6 }}>A password reset link has been sent to <strong style={{ color:B.text }}>{email}</strong>. It expires in 15 minutes.</p>
            </div>
          )}
        </Card>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:B.muted, fontSize:13, marginTop:20, display:"block", margin:"20px auto 0" }}>← Back to Sign In</button>
      </div>
    </div>
  );
};

// REQUEST ACCESS
const SignupScreen = ({ onBack }) => {
  const [form, setForm] = useState({ name:"", email:"", phone:"", message:"" });
  const [sent, setSent] = useState(false);
  const set = k => v => setForm(f=>({...f,[k]:v}));
  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(160deg, #1a1a00 0%, #000000 50%, #0d0800 100%)`, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:520 }}>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", marginBottom:28 }}>
          <HoneycombLogo size={56}/>
          <h1 style={{ fontSize:22, fontWeight:700, color:B.text, margin:"12px 0 4px" }}>Request Access</h1>
          <p style={{ fontSize:12, color:B.muted }}>Your coach will activate your account</p>
        </div>
        {!sent ? (
          <Card>
            <Input label="Full Name" value={form.name} onChange={set("name")} placeholder="Your full name"/>
            <Input label="Email" type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" icon={<Ic n="mail" size={16} c={B.muted}/>}/>
            <Input label="Phone" value={form.phone} onChange={set("phone")} placeholder="+1 (555) 000-0000"/>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:6 }}>Message (optional)</label>
              <textarea value={form.message} onChange={e=>set("message")(e.target.value)} placeholder="Anything your coach should know..."
                style={{ width:"100%", background:B.card, border:`1px solid ${B.border}`, borderRadius:10, padding:"12px 14px", color:B.text, fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit", resize:"vertical", minHeight:80 }}/>
            </div>
            <Btn onClick={()=>setSent(true)} fullWidth disabled={!form.name||!form.email}>Submit Request</Btn>
          </Card>
        ) : (
          <Card>
            <div style={{ textAlign:"center", padding:"12px 0" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
              <h3 style={{ color:B.text, fontSize:16, marginBottom:8 }}>Request Submitted</h3>
              <p style={{ fontSize:13, color:B.muted, lineHeight:1.6 }}>Your coach will review your request and send you login credentials within 24 hours.</p>
            </div>
          </Card>
        )}
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:B.muted, fontSize:13, marginTop:20, display:"block", margin:"20px auto 0" }}>← Back to Sign In</button>
      </div>
    </div>
  );
};

// ─── DASHBOARD SCREENS ────────────────────────────────────────────────────────

const HomeScreen = ({ user }) => {
  return (
    <Screen>
      {/* Header */}
      <div style={{ background:`linear-gradient(180deg, #1a1200 0%, #000000 100%)`, padding:"28px 20px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4, gap:8 }}>
          <div style={{ minWidth:0 }}>
            <p style={{ fontSize:11, color:B.muted, fontWeight:700, letterSpacing:1, textTransform:"uppercase", margin:"0 0 4px" }}>Welcome back</p>
            <h1 style={{ fontSize:22, fontWeight:700, color:B.text, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.name}</h1>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
            <Badge color={B.gold}>{user.role.replace("_"," ")}</Badge>
            <div style={{ width:42, height:42, borderRadius:21, background:`linear-gradient(135deg,${B.gold},${"#ffa600"})`, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:16, fontWeight:700, color:"#fff" }}>{user.name[0]}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Announcement banner */}
      <div style={{ margin:"16px 20px 0", background:B.card, border:`1px solid ${B.gold}33`, borderLeft:`3px solid ${B.gold}`, borderRadius:10, padding:"12px 14px" }}>
        <p style={{ fontSize:11, fontWeight:700, color:B.gold, margin:"0 0 3px", letterSpacing:0.8 }}>COACH UPDATE</p>
        <p style={{ fontSize:13, color:B.text, margin:0 }}>Your weekly check-in is due Wednesday before 9 AM CST. Remember to take your morning weight fasted.</p>
      </div>

      {/* This week */}
      <div style={{ padding:"20px 20px 0" }}>
        <p style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 12px" }}>This Week</p>
        {[
          { label:"Habit Tracker", status:"3/7 days", color:B.gold },
          { label:"Weekly Check-In", status:"Due Wednesday", color:"#ffa600" },
          { label:"Diet Adherence", status:"On track", color:B.success },
        ].map(({ label, status, color }) => (
          <div key={label} style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:10, padding:"12px 14px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, color:B.text, fontWeight:500 }}>{label}</span>
            <Badge color={color}>{status}</Badge>
          </div>
        ))}
      </div>

      {/* Resources links */}
      <div style={{ padding:"20px 20px 32px" }}>
        <p style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 12px" }}>Lifestyle of Eden</p>
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
const CS_H    = { 'apikey':CS_ANON, 'Authorization':`Bearer ${CS_ANON}`, 'Content-Type':'application/json', 'Prefer':'return=representation' };
async function csGet(table:string, q='') { try { const r=await fetch(`${CS_URL}/rest/v1/${table}?${q}`,{headers:CS_H}); return r.ok?r.json():[] } catch { return [] } }
async function csSave(table:string, body:any, id?:string) {
  const url = id ? `${CS_URL}/rest/v1/${table}?id=eq.${id}` : `${CS_URL}/rest/v1/${table}`;
  try { const r=await fetch(url,{method:id?'PATCH':'POST',headers:CS_H,body:JSON.stringify(body)}); const t=await r.text(); return t?JSON.parse(t):null } catch { return null }
}

const DEFAULT_SOCIALS = [
  { emoji:"🎙", label:"Spotify Podcast", sub:"Full show · all episodes",  url:"https://open.spotify.com/show/0hEI4GF66eXXMSxlgmbVUP",  accent:"#1DB954", bg:"#1DB95418" },
  { emoji:"📺", label:"YouTube",         sub:"@lifestyleofeden3879",       url:"https://www.youtube.com/@lifestyleofeden3879",            accent:"#FF0000", bg:"#FF000018" },
  { emoji:"📸", label:"Instagram",       sub:"@nicktofficial",             url:"https://www.instagram.com/nicktofficial/",                accent:"#E1306C", bg:"#E1306C18" },
  { emoji:"👥", label:"Facebook",        sub:"Lifestyle of Eden Page",     url:"https://www.facebook.com/profile.php?id=61587350518067",  accent:"#1877F2", bg:"#1877F218" },
  { emoji:"🌐", label:"Website",         sub:"lifestyleofeden.com",        url:"https://lifestyleofeden.com",                            accent:B.gold,    bg:`${B.gold}18` },
  { emoji:"🛍", label:"Eden Clothing",   sub:"Shop the brand",             url:"https://lifestyle-of-eden.myshopify.com/",               accent:B.gold,    bg:`${B.gold}18` },
];

const CommunityScreen = ({ user }:any) => {
  const isAdmin  = user?.role === 'super_admin';
  const isCoach  = user?.role === 'coach';

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

  // Step 1: resolve coach identity
  useEffect(()=>{
    if (isAdmin) {
      csGet('user_profiles','role=in.(coach,head_coach)&select=id,name&order=name.asc').then((rows:any[])=>{
        setCoachList(rows||[]);
        if (rows?.[0]?.id) setPickedCoachId(rows[0].id);
      });
    } else if (isCoach) {
      csGet('user_profiles',`email=eq.${encodeURIComponent(user?.email||'')}&select=id`).then((rows:any[])=>{
        if (rows?.[0]?.id) setMyCoachId(rows[0].id);
      });
    } else {
      // client: look up their coach via client_access
      csGet('user_profiles',`email=eq.${encodeURIComponent(user?.email||'')}&select=id`).then(async (rows:any[])=>{
        const clientId = rows?.[0]?.id; if (!clientId) return;
        const ca:any[] = await csGet('client_access',`client_id=eq.${clientId}&select=staff_id&limit=1`);
        if (ca?.[0]?.staff_id) setMyCoachId(ca[0].staff_id);
      });
    }
  },[user?.email]);

  // Step 2: load links whenever the active coach changes
  const activeCoachId = isAdmin ? pickedCoachId : myCoachId;
  useEffect(()=>{
    if (!activeCoachId) return;
    setEditing(false);
    csGet('coach_social_links',`coach_id=eq.${activeCoachId}&limit=1`).then((rows:any[])=>{
      if (rows?.[0]?.links?.length) {
        setSocials(rows[0].links); setDraft(rows[0].links); setRowId(rows[0].id);
      } else {
        setSocials(DEFAULT_SOCIALS); setDraft(DEFAULT_SOCIALS); setRowId('');
      }
    });
  },[activeCoachId]);

  const updateDraft = (i:number, field:string, val:string) =>
    setDraft(prev=>prev.map((s:any,idx:number)=>idx===i?{...s,[field]:val}:s));

  const saveLinks = async () => {
    if (!activeCoachId) return;
    setSocials(draft); setEditing(false);
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
        <p style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 4px" }}>Lifestyle of Eden</p>
        <h1 style={{ fontSize:22, fontWeight:800, color:B.text, margin:"0 0 4px" }}>Connect</h1>
        <p style={{ fontSize:12, color:B.muted, margin:0 }}>Podcast · social media · shop — all in one place</p>
      </div>

      {/* Admin: coach picker */}
      {isAdmin && coachList.length > 0 && (
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
              Edit links — {coachList.find((c:any)=>c.id===pickedCoachId)?.name||'Coach'}
            </p>
            <p style={{ fontSize:10, color:B.muted, margin:"0 0 12px" }}>Eden defaults pre-filled. Change any field and save.</p>
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
                Save for {coachList.find((c:any)=>c.id===pickedCoachId)?.name?.split(' ')[0]||'Coach'}
              </button>
            </div>
          </div>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {socials.map(({ emoji, label, sub, url, accent, bg }:any) => (
            <a key={label} href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
              <div style={{ background:bg||`${B.gold}18`, border:`1px solid ${(accent||B.gold)}44`, borderRadius:14, padding:"14px 12px", display:"flex", flexDirection:"column", gap:6, height:"100%", boxSizing:"border-box" }}>
                <span style={{ fontSize:24 }}>{emoji}</span>
                <div>
                  <p style={{ fontSize:13, fontWeight:700, color:B.text, margin:"0 0 2px" }}>{label}</p>
                  <p style={{ fontSize:10, color:B.muted, margin:0, lineHeight:1.4 }}>{sub}</p>
                </div>
                <span style={{ fontSize:11, color:accent||B.gold, fontWeight:700, marginTop:"auto" }}>Open →</span>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* 7 Pillars episodes */}
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

// COACH VIEW
const CLIENT_ROSTER = [
  {
    name:"Jordan Williams", status:"Active", lastCheckin:"Jul 9", alert:true,
    uuid:"ece58b33-3f2a-4ce7-bed9-a157c914056c",
    email:"client@eden.io", phone:"(312) 555-0192", startDate:"Mar 4 2026",
    protocol:"Base Diet Protocol Female · 2 High / 2 Low",
    goal:"Fat loss + hormonal balance", currentWeight:"148 lbs", targetWeight:"135 lbs",
    height:"5'5\"", age:29, gender:"Female",
    tags:["Gut Protocol","Nervous System","Thyroid"],
    notes:"Excellent compliance. Adjust protein up 10g on high days next week. Watch cycle days 14-18.",
    checkInDay:"Wednesday", nextCheckin:"Jul 16", pendingLabs:true,
    alertReasons:["Stress score elevated last 2 check-ins"],
    checkinHistory:[
      { date:"Jul 9 2026", time:"7:23 AM",  weight:"148.0", temp:"97.8", steps:"9,200", heartRate:"62", hrv:"68", bloodPressure:"118/74",
        energy:7, sleep:6, bloating:7, brainFog:7, sexDrive:6, hunger:4, stress:5, compliance:92, mood:"Motivated",
        sleepWindow:"10:30 PM – 6:00 AM", sleepCycles:"4–5 cycles", sleepDisruption:"Woke once around 3 AM, went back to sleep within 10 min. Otherwise solid.",
        bowelCount:"2", bowelType:"Well formed",
        clientNotes:"Feeling leaner, energy is better mid-week. Had one off-meal Saturday.",
        coachNotes:"Great week. Protein hit targets 6/7 days. Reduce stress load — consider walking at night.",
        coachLoom:"https://www.loom.com/share/dcd12b7cfc3e42fdaf1e0c0a46a15ab5",
        habitPct:88, habits:{supps:7,lemon:7,water:7,steps:6,wake5:6,workout:5,cold:6,sleep8:5,read:5} },
      { date:"Jul 2 2026", time:"6:58 AM",  weight:"149.0", temp:"97.6", steps:"7,800", heartRate:"68", hrv:"58", bloodPressure:"122/78",
        energy:6, sleep:5, bloating:6, brainFog:5, sexDrive:5, hunger:7, stress:7, compliance:85, mood:"Stressed",
        sleepWindow:"11:00 PM – 6:30 AM", sleepCycles:"3–4 cycles", sleepDisruption:"Woke multiple times — mind racing from work. Hard to fall back asleep after 4 AM.",
        bowelCount:"1", bowelType:"Mixed",
        clientNotes:"Work has been crazy. Skipped meal 4 twice. Cravings late at night.",
        coachNotes:"Understandable week. Add L-Theanine AM. Plan meals 3 and 4 on Sunday prep day.",
        coachLoom:"", habitPct:71, habits:{supps:6,lemon:5,water:6,steps:5,wake5:4,workout:3,cold:3,sleep8:4,read:3} },
      { date:"Jun 25 2026", time:"8:14 AM", weight:"150.0", temp:"97.7", steps:"8,500", heartRate:"64", hrv:"62", bloodPressure:"120/76",
        energy:6, sleep:6, bloating:4, brainFog:6, sexDrive:6, hunger:5, stress:6, compliance:88, mood:"Neutral",
        sleepWindow:"10:45 PM – 6:15 AM", sleepCycles:"4 cycles", sleepDisruption:"Woke once for bathroom around 2 AM. Light sleep in the early morning hours.",
        bowelCount:"2", bowelType:"Mixed",
        clientNotes:"Bloating mid-week, not sure if it was the oats. Sleep okay.",
        coachNotes:"Swap oats for cream of rice on low days. Continue Bloat Eaze. Good overall week.",
        habitPct:81, habits:{supps:7,lemon:6,water:7,steps:6,wake5:5,workout:4,cold:5,sleep8:5,read:4} },
      { date:"Jun 18 2026", time:"10:47 AM", weight:"151.0", temp:"97.4", steps:"6,200", heartRate:"72", hrv:"52", bloodPressure:"124/80",
        energy:5, sleep:5, bloating:3, brainFog:4, sexDrive:3, hunger:8, stress:8, compliance:80, mood:"Tired",
        sleepWindow:"11:30 PM – 6:00 AM", sleepCycles:"3 cycles", sleepDisruption:"Tossed and turned during cycle days. Night sweats twice. Very restless between 2–4 AM.",
        bowelCount:"1", bowelType:"Constipated",
        clientNotes:"Hormones off this week. Very fatigued, cycle week. Cravings terrible.",
        coachNotes:"Normal for cycle days 14-18. Drop to maintenance calories days 1-3. Increase magnesium.",
        habitPct:60, habits:{supps:5,lemon:4,water:5,steps:3,wake5:3,workout:2,cold:2,sleep8:3,read:2} },
      { date:"Jun 11 2026", time:"6:30 AM", weight:"152.0", temp:"98.0", steps:"10,400", heartRate:"60", hrv:"74", bloodPressure:"116/72",
        energy:8, sleep:8, bloating:8, brainFog:8, sexDrive:7, hunger:3, stress:4, compliance:96, mood:"Great",
        sleepWindow:"10:00 PM – 6:00 AM", sleepCycles:"5–6 cycles", sleepDisruption:"None — slept completely through. Woke up feeling fully rested.",
        bowelCount:"2", bowelType:"Well formed",
        clientNotes:"Best week yet. Energy all day, no bloating, sleep was amazing.",
        coachNotes:"This is the template. Protocol is working. Keep exact same approach next week.",
        habitPct:96, habits:{supps:7,lemon:7,water:7,steps:7,wake5:7,workout:5,cold:7,sleep8:7,read:6} },
      { date:"Jun 4 2026", time:"7:45 AM",  weight:"152.5", temp:"97.9", steps:"9,600", heartRate:"63", hrv:"70", bloodPressure:"119/75",
        energy:7, sleep:7, bloating:7, brainFog:7, sexDrive:6, hunger:4, stress:5, compliance:90, mood:"Good",
        sleepWindow:"10:30 PM – 6:30 AM", sleepCycles:"4–5 cycles", sleepDisruption:"Woke once briefly around 2 AM, felt alert for about 20 min, then fell back asleep.",
        bowelCount:"2", bowelType:"Well formed",
        clientNotes:"Feeling good. High days felt heavy but manageable. Step goal hit 5/7 days.",
        coachNotes:"Solid week. Add 1000 steps to daily target. Consider adding Oregano Pro Week 3.",
        habitPct:87, habits:{supps:7,lemon:7,water:6,steps:5,wake5:6,workout:4,cold:5,sleep8:6,read:5} },
      { date:"May 28 2026", time:"8:52 AM", weight:"153.0", temp:"97.7", steps:"7,500", heartRate:"65", hrv:"60", bloodPressure:"121/77",
        energy:6, sleep:6, bloating:6, brainFog:6, sexDrive:5, hunger:5, stress:6, compliance:82, mood:"Neutral",
        sleepWindow:"11:00 PM – 6:30 AM", sleepCycles:"4 cycles", sleepDisruption:"New protocol adjustments causing some restlessness. Mind active thinking about meal prep.",
        bowelCount:"2", bowelType:"Mixed",
        clientNotes:"Adjusting to the new protocol. Still figuring out meal timing.",
        coachNotes:"Week 1 adjustment is normal. Focus on hitting protein first. Timing comes second.",
        habitPct:72, habits:{supps:6,lemon:5,water:6,steps:4,wake5:4,workout:3,cold:4,sleep8:5,read:3} },
    ],
  },
  {
    name:"Alex Martinez", status:"Active", lastCheckin:"Jul 8", alert:false,
    email:"alex@eden.io", phone:"(773) 555-0341", startDate:"Apr 12 2026",
    protocol:"Base Diet Protocol Male · Maintenance",
    goal:"Body recomposition", currentWeight:"182 lbs", targetWeight:"178 lbs",
    height:"5'11\"", age:34, gender:"Male",
    tags:["NuEthix Protocol"],
    notes:"Strong progress. Maintaining current macros. Add 5R Gut in week 6.",
    checkInDay:"Wednesday", nextCheckin:"Jul 15", pendingLabs:false, alertReasons:[],
    checkinHistory:[
      { date:"Jul 8 2026", time:"7:05 AM",  weight:"182.0", temp:"98.2", steps:"11,200", heartRate:"58", hrv:"82", bloodPressure:"124/80",
        energy:8, sleep:7, bloating:8, brainFog:8, sexDrive:8, hunger:3, stress:4, compliance:94, mood:"Confident",
        sleepWindow:"10:00 PM – 6:00 AM", sleepCycles:"5 cycles", sleepDisruption:"Minimal — woke once briefly around 5 AM but fell back asleep quickly.",
        bowelCount:"2", bowelType:"Well formed",
        clientNotes:"Feeling strong. Lifts are up. Body looking leaner without losing weight.",
        coachNotes:"Recomp is working. Stay at current calories. Add creatine 5g daily." },
      { date:"Jul 1 2026", time:"7:38 AM",  weight:"183.0", temp:"98.1", steps:"10,800", heartRate:"60", hrv:"78", bloodPressure:"126/82",
        energy:7, sleep:7, bloating:7, brainFog:7, sexDrive:7, hunger:4, stress:5, compliance:91, mood:"Good",
        sleepWindow:"10:30 PM – 6:30 AM", sleepCycles:"4–5 cycles", sleepDisruption:"Slight snoring noted by partner. Used nasal strip — helped somewhat. Woke once.",
        bowelCount:"2", bowelType:"Well formed",
        clientNotes:"Consistent week. Hit all meals. Had a cheat meal Sunday — burger and fries.",
        coachNotes:"One cheat meal is fine. Back on plan Monday. Compliance is very strong." },
      { date:"Jun 24 2026", time:"9:22 AM", weight:"183.5", temp:"98.0", steps:"8,900", heartRate:"62", hrv:"72", bloodPressure:"128/82",
        energy:7, sleep:6, bloating:7, brainFog:6, sexDrive:6, hunger:5, stress:6, compliance:88, mood:"Good",
        sleepWindow:"11:00 PM – 6:00 AM", sleepCycles:"3–4 cycles", sleepDisruption:"Hotel stay — different bed, light sleep first two nights. Improved by night 3.",
        bowelCount:"2", bowelType:"Well formed",
        clientNotes:"Travel week — made it work at hotel gym. Ate out a few times but made smart choices.",
        coachNotes:"Excellent discipline traveling. Proud of the effort. Weight holding steady is great." },
      { date:"Jun 17 2026", time:"6:45 AM", weight:"184.0", temp:"98.3", steps:"12,100", heartRate:"56", hrv:"88", bloodPressure:"122/78",
        energy:8, sleep:8, bloating:9, brainFog:9, sexDrive:8, hunger:2, stress:3, compliance:97, mood:"Excellent",
        sleepWindow:"9:30 PM – 5:45 AM", sleepCycles:"5–6 cycles", sleepDisruption:"None — best sleep of the entire program. Woke up fully alert before the alarm.",
        bowelCount:"2", bowelType:"Well formed",
        clientNotes:"Perfect week. Meal prepped Sunday, hit every single meal.",
        coachNotes:"97% compliance is elite. This week proved what's possible. Use it as your baseline." },
      { date:"Jun 10 2026", time:"8:17 AM", weight:"184.5", temp:"98.0", steps:"9,200", heartRate:"64", hrv:"68", bloodPressure:"126/80",
        energy:6, sleep:6, bloating:6, brainFog:5, sexDrive:6, hunger:6, stress:5, compliance:85, mood:"Neutral",
        sleepWindow:"10:30 PM – 6:30 AM", sleepCycles:"4 cycles", sleepDisruption:"Slightly restless — possible low carb before bed. Woke around 3 AM feeling hungry.",
        bowelCount:"2", bowelType:"Mixed",
        clientNotes:"Little flat energy-wise. Wondering if calories are too low.",
        coachNotes:"Bump carbs 20g on training days only. Add GDA-MAX Pro with higher carb meals." },
    ],
  },
  {
    name:"Taylor Reyes", status:"Active", lastCheckin:"Jul 7", alert:false,
    email:"taylor@eden.io", phone:"(312) 555-0887", startDate:"May 1 2026",
    protocol:"2 High 2 Low Female · 10% Deficit",
    goal:"Weight loss + energy", currentWeight:"165 lbs", targetWeight:"148 lbs",
    height:"5'7\"", age:27, gender:"Female",
    tags:["Adrenal Protocol","PCOS Protocol"],
    notes:"Feeling more energy week 4. Keep pushing hydration and step goal.",
    checkInDay:"Friday", nextCheckin:"Jul 14", pendingLabs:false, alertReasons:[],
    checkinHistory:[
      { date:"Jul 7 2026", time:"7:31 AM",  weight:"165.0", temp:"97.8", steps:"9,800", heartRate:"66", hrv:"64", bloodPressure:"112/70",
        energy:7, sleep:7, bloating:7, brainFog:7, sexDrive:6, hunger:5, stress:5, compliance:89, mood:"Motivated",
        sleepWindow:"10:30 PM – 6:15 AM", sleepCycles:"4–5 cycles", sleepDisruption:"Woke once for bathroom around 2 AM. Light sleep 3–4 AM but overall decent.",
        bowelCount:"2", bowelType:"Well formed",
        clientNotes:"Noticed waist is smaller even if scale is same. Clothes fitting different.",
        coachNotes:"Body recomp happening. Scale isn't everything — measurements tell the real story." },
      { date:"Jun 30 2026", time:"9:48 AM", weight:"166.0", temp:"97.6", steps:"8,600", heartRate:"68", hrv:"60", bloodPressure:"114/72",
        energy:6, sleep:6, bloating:6, brainFog:6, sexDrive:5, hunger:7, stress:6, compliance:84, mood:"Okay",
        sleepWindow:"11:00 PM – 6:30 AM", sleepCycles:"4 cycles", sleepDisruption:"Struggled to fall asleep — hunger pangs kept me up until about midnight.",
        bowelCount:"2", bowelType:"Mixed",
        clientNotes:"Struggled with low day hunger. Kept reaching for extra snacks.",
        coachNotes:"Add cucumber and celery as free foods on low days. Up water to 1 gallon." },
      { date:"Jun 23 2026", time:"7:53 AM", weight:"167.0", temp:"97.8", steps:"9,200", heartRate:"67", hrv:"62", bloodPressure:"113/71",
        energy:7, sleep:6, bloating:6, brainFog:7, sexDrive:6, hunger:6, stress:5, compliance:86, mood:"Good",
        sleepWindow:"10:45 PM – 6:00 AM", sleepCycles:"4–5 cycles", sleepDisruption:"Woke once briefly, went back to sleep quickly. No major disruptions.",
        bowelCount:"2", bowelType:"Well formed",
        clientNotes:"High days feel amazing. Low days are a mental battle but getting easier.",
        coachNotes:"This is the adaptation phase. It gets easier by week 6. Stay the course." },
      { date:"Jun 16 2026", time:"11:24 AM", weight:"168.0", temp:"97.3", steps:"5,800", heartRate:"74", hrv:"50", bloodPressure:"116/74",
        energy:5, sleep:5, bloating:4, brainFog:4, sexDrive:3, hunger:8, stress:8, compliance:75, mood:"Struggling",
        sleepWindow:"11:30 PM – 6:30 AM", sleepCycles:"3 cycles", sleepDisruption:"Period cramps woke me at 2 AM and again at 4 AM. Heating pad helped but sleep was broken all week.",
        bowelCount:"1", bowelType:"Constipated",
        clientNotes:"Really hard week. Period cramps, emotional eating Thursday.",
        coachNotes:"Hormonal week is expected. No guilt. Add Cort Eaze on high-stress days." },
      { date:"Jun 9 2026", time:"8:06 AM",  weight:"168.5", temp:"97.7", steps:"8,200", heartRate:"68", hrv:"58", bloodPressure:"114/72",
        energy:6, sleep:7, bloating:6, brainFog:6, sexDrive:5, hunger:5, stress:5, compliance:82, mood:"Neutral",
        sleepWindow:"10:30 PM – 6:30 AM", sleepCycles:"4 cycles", sleepDisruption:"Slight restlessness falling asleep. Woke once briefly, back to sleep within 5 min.",
        bowelCount:"2", bowelType:"Mixed",
        clientNotes:"Getting used to the structure. Meal prep is getting easier.",
        coachNotes:"Week 5 progress is solid. Drop scale check-ins to 1x/week — focus on how you feel." },
    ],
  },
  {
    name:"Sam Thompson", status:"Pending check-in", lastCheckin:"Jun 30", alert:true,
    email:"sam@eden.io", phone:"(847) 555-0563", startDate:"Feb 18 2026",
    protocol:"Male Leaky Gut Base Diet · 5% Deficit",
    goal:"Gut healing + lean muscle", currentWeight:"191 lbs", targetWeight:"185 lbs",
    height:"6'0\"", age:41, gender:"Male",
    tags:["5R Gut Protocol","Methylation Protocol"],
    notes:"Check-in overdue. Follow up via message. Labs pending GI Map results.",
    checkInDay:"Wednesday", nextCheckin:"Overdue", pendingLabs:true,
    alertReasons:["Check-in overdue — last submitted Jun 30","Elevated stress score 3 weeks in a row"],
    checkinHistory:[
      { date:"Jun 30 2026", time:"2:14 PM", weight:"191.0", temp:"97.4", steps:"6,800", heartRate:"72", hrv:"52", bloodPressure:"134/86",
        energy:5, sleep:5, bloating:2, brainFog:4, sexDrive:4, hunger:6, stress:7, compliance:78, mood:"Frustrated",
        sleepWindow:"11:30 PM – 5:30 AM", sleepCycles:"3 cycles", sleepDisruption:"Woke 2–3 times with gut discomfort and bloating. Had to get up once at 2 AM. Very broken sleep.",
        bowelCount:"3", bowelType:"Loose",
        clientNotes:"Gut still acting up. Bloating after every meal. Getting discouraged.",
        coachNotes:"Stick with protocol — gut healing takes 6-8 weeks minimum. GI Map will show what's happening." },
      { date:"Jun 23 2026", time:"8:33 AM", weight:"192.0", temp:"97.5", steps:"7,200", heartRate:"70", hrv:"54", bloodPressure:"132/84",
        energy:5, sleep:5, bloating:3, brainFog:4, sexDrive:4, hunger:5, stress:7, compliance:80, mood:"Neutral",
        sleepWindow:"11:00 PM – 5:45 AM", sleepCycles:"3 cycles", sleepDisruption:"Gut cramps woke me at 2 AM — had to use the bathroom. Racing mind afterwards. Poor quality overall.",
        bowelCount:"4", bowelType:"Diarrhea",
        clientNotes:"Same issues. Some days better than others. Sleep is poor.",
        coachNotes:"Add Relax Liposomal before bed. Remove raw vegetables temporarily, cook all produce." },
      { date:"Jun 16 2026", time:"7:19 AM", weight:"192.5", temp:"97.6", steps:"7,800", heartRate:"68", hrv:"58", bloodPressure:"130/82",
        energy:6, sleep:6, bloating:4, brainFog:5, sexDrive:5, hunger:5, stress:6, compliance:83, mood:"Hopeful",
        sleepWindow:"10:45 PM – 5:30 AM", sleepCycles:"3–4 cycles", sleepDisruption:"Better than last week — only woke once. Less gut pain at night. Still not deep sleep.",
        bowelCount:"2", bowelType:"Loose",
        clientNotes:"Slightly better this week. Less bloating after breakfast at least.",
        coachNotes:"Green shoots. Morning protocol is working. Focus on that consistency." },
      { date:"Jun 9 2026", time:"9:55 AM",  weight:"193.0", temp:"97.2", steps:"5,800", heartRate:"76", hrv:"48", bloodPressure:"136/88",
        energy:5, sleep:4, bloating:2, brainFog:3, sexDrive:3, hunger:6, stress:8, compliance:75, mood:"Tired",
        sleepWindow:"12:00 AM – 5:30 AM", sleepCycles:"2–3 cycles", sleepDisruption:"Very poor. Gut pain woke me multiple times. Racing mind from work stress. Felt exhausted all week.",
        bowelCount:"4", bowelType:"Diarrhea",
        clientNotes:"Very fatigued. Not sleeping well. Work stress is high.",
        coachNotes:"Cortisol is elevated. Add Cort Eaze 2 caps waking + 2 caps before bed. Prioritize sleep." },
      { date:"Jun 2 2026", time:"7:42 AM",  weight:"194.0", temp:"97.5", steps:"7,000", heartRate:"70", hrv:"55", bloodPressure:"132/84",
        energy:6, sleep:6, bloating:3, brainFog:5, sexDrive:4, hunger:6, stress:6, compliance:79, mood:"Okay",
        sleepWindow:"11:00 PM – 6:00 AM", sleepCycles:"3 cycles", sleepDisruption:"Woke twice with gut discomfort. Fell back asleep okay. Sleep quality improving slightly.",
        bowelCount:"3", bowelType:"Loose",
        clientNotes:"Starting to understand the protocol better. Prep has improved.",
        coachNotes:"Gut healing is slow but progress is real. Labs ordered — GI Map and blood panel." },
      { date:"May 26 2026", time:"8:28 AM", weight:"194.5", temp:"97.3", steps:"5,400", heartRate:"74", hrv:"50", bloodPressure:"134/86",
        energy:5, sleep:5, bloating:2, brainFog:4, sexDrive:3, hunger:7, stress:7, compliance:72, mood:"Struggling",
        sleepWindow:"12:30 AM – 5:30 AM", sleepCycles:"2 cycles", sleepDisruption:"Late nights from work deadlines. Only 5 hours. Woke exhausted. Gut issues compounded poor sleep.",
        bowelCount:"3", bowelType:"Diarrhea",
        clientNotes:"Hardest part is meal timing with work schedule. Skipping meals often.",
        coachNotes:"Use protein shakes as bridge meals. Schedule alarms for meal 3 and 4." },
    ],
  },
];

const UPDATE_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

const ClientDetailModal = ({ client, onClose, onNavigate }) => {
  const isMobile = useIsMobile();
  const [historyView, setHistoryView] = useState<"timeline"|"charts">("timeline");
  const [localHistory, setLocalHistory] = useState<any[]>(client?.checkinHistory || []);
  const [editingIdx,   setEditingIdx]   = useState<number|null>(null);
  const [draftNote,    setDraftNote]    = useState('');
  const [draftLoom,    setDraftLoom]    = useState('');
  const [updateDay,    setUpdateDay]    = useState<string>('');
  const [savingDay,    setSavingDay]    = useState(false);

  useEffect(() => {
    if (!client?.uuid) return;
    sbGet('user_profiles', `id=eq.${client.uuid}&select=update_day`)
      .then((rows: any[]) => {
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
            <p style={{ fontSize:18, fontWeight:800, color:B.text, margin:"0 0 4px" }}>{client.name}</p>
            <p style={{ fontSize:11, color:B.muted, margin:0 }}>{client.email} · {client.phone}</p>
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
                  setSavingDay(true);
                  await sbPatch('user_profiles', `id=eq.${client.uuid}`, { update_day: day });
                  setSavingDay(false);
                }}
                style={{ flex:1, background:B.surface, border:`1px solid ${B.border}`, borderRadius:8, padding:"9px 12px",
                  color: updateDay ? B.gold : B.muted, fontSize:13, outline:"none", cursor:"pointer" }}>
                <option value="">— Not assigned yet —</option>
                {UPDATE_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {savingDay
                ? <span style={{ fontSize:11, color:B.muted, whiteSpace:"nowrap" }}>Saving…</span>
                : updateDay
                  ? <span style={{ fontSize:11, color:B.gold, fontWeight:700, whiteSpace:"nowrap" }}>✓ Saved</span>
                  : null}
            </div>
            {updateDay && (
              <p style={{ fontSize:11, color:B.muted, margin:"8px 0 0", lineHeight:1.5 }}>
                Client sees <strong style={{ color:B.text }}>every {updateDay}</strong> as their weekly deadline (before 9 AM CST).
              </p>
            )}
            {!client.uuid && (
              <p style={{ fontSize:10, color:B.muted, margin:"6px 0 0", fontStyle:"italic" }}>
                Add a uuid to this client's roster entry to enable saving.
              </p>
            )}
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
            <p style={{ fontSize:16, fontWeight:800, color:B.text, margin:"0 0 2px" }}>⚠️ {client.name} — Alerts</p>
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
function isMissingCheckin(c: any): boolean {
  if (c.nextCheckin === 'Overdue') return true;
  const last = parseLastCheckin(c.lastCheckin);
  if (!last) return true;
  const today = new Date();
  return (today.getTime() - last.getTime()) / 86400000 > 7;
}

// ── Coach Dashboard ───────────────────────────────────────────────────────────
const CoachDashboard = ({ user, onNavigate, loomMode, setLoomMode, loomFeatured, followedUp, setFollowedUp }) => {
  const isMobile = useIsMobile();
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [rosterOpen,     setRosterOpen]     = useState(true);
  const [missOpen,       setMissOpen]       = useState(true);
  const [alertClient,    setAlertClient]    = useState<any>(null);
  // Track resolved alert reasons per client email
  const [resolved, setResolved]             = useState<Record<string,Set<string>>>({});
  const [checkinDeadline, setCheckinDeadline] = useState("09:00");
  const clients = CLIENT_ROSTER;
  // Guard: ensure loomFeatured is always a Set regardless of how the prop arrives
  const featuredSet: Set<string> = (loomFeatured instanceof Set) ? loomFeatured : new Set();

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

  const isFeatured      = (c: any)            => featuredSet.has(c.name);
  const displayName     = (c: any, i: number) => (loomMode && !isFeatured(c)) ? `Client ${String.fromCharCode(65+i)}` : c.name;
  const displayProtocol = (c: any)            => (loomMode && !isFeatured(c)) ? "Protocol hidden" : c.protocol;
  const displayCheckin  = (c: any)            => (loomMode && !isFeatured(c)) ? "—" : c.lastCheckin;

  const missingClients = clients.filter(c => isMissingCheckin(c));

  return (
    <Screen>
      {/* Header */}
      <div style={{ background:`linear-gradient(180deg,#111100 0%,#000000 100%)`, padding:"20px 20px 16px" }}>
        <p style={{ fontSize:11, color:B.muted, fontWeight:700, letterSpacing:1, margin:"0 0 4px" }}>COACH PORTAL</p>
        <h1 style={{ fontSize:22, fontWeight:700, color:B.text, margin:0 }}>{user.name}</h1>
        <p style={{ fontSize:12, color:B.muted, margin:"4px 0 0" }}>Lifestyle of Eden · {clients.length} active clients</p>
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
            {/* Deadline setting */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
              <span style={{ fontSize:11, color:B.muted, fontWeight:600 }}>Check-in deadline:</span>
              <input type="time" value={checkinDeadline} onChange={e=>setCheckinDeadline(e.target.value)}
                style={{ background:B.surface, border:`1px solid ${B.border}`, borderRadius:6, padding:"4px 8px",
                  color:B.text, fontSize:12, outline:"none", colorScheme:"dark" }}/>
              <span style={{ fontSize:10, color:B.muted }}>— clients past this time are flagged</span>
            </div>

            {/* Group by check-in day — only show clients who are missing */}
            {(() => {
              const anyShown = Object.values(byDay).some((dc: any[]) =>
                dc.some(c => isMissingCheckin(c) && !followedUp.has(c.email))
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
                  : (dayClients as any[]).filter(c => isMissingCheckin(c) && !followedUp.has(c.email));
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
            {clients.map((c,i)=>{
              const alertOn = isAlertActive(c);
              return (
                <div key={i} style={{ width:"100%", background:B.card,
                  border:`1px solid ${B.border}`,
                  borderLeft:`3px solid ${(!loomMode && alertOn) ? B.gold : (!loomMode && c.alert===false) ? B.success : B.border}`,
                  borderRadius:14, padding:"14px 16px", marginBottom:10, boxSizing:"border-box" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ flex:1, minWidth:0, cursor:"pointer" }}
                      onClick={()=>setSelectedClient(c)}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <p style={{ fontSize:14, fontWeight:700, color:B.text, margin:0 }}>{displayName(c,i)}</p>
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
                        onClick={()=>setSelectedClient(c)}>View →</span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop:6 }}>
              <Btn variant="secondary" fullWidth><Ic n="upload" size={16} c={B.muted}/>Import Client from GHL</Btn>
            </div>
          </>
        )}
      </div>

      {selectedClient && (
        <ClientDetailModal client={selectedClient} onClose={()=>setSelectedClient(null)} onNavigate={onNavigate}/>
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
const SB_H    = { 'apikey':SB_ANON, 'Authorization':`Bearer ${SB_ANON}`, 'Content-Type':'application/json', 'Prefer':'return=representation' };
async function sbGet(table:string, params='') {
  try { const r=await fetch(`${SB_URL}/rest/v1/${table}?${params}`,{headers:SB_H}); if(!r.ok) return []; return r.json(); } catch { return []; }
}
async function sbInsert(table:string, body:any) {
  try { const r=await fetch(`${SB_URL}/rest/v1/${table}`,{method:'POST',headers:SB_H,body:JSON.stringify(body)}); if(!r.ok) return null; const t=await r.text(); return t?JSON.parse(t):null; } catch { return null; }
}
async function sbPatch(table:string, params:string, body:any) {
  try { await fetch(`${SB_URL}/rest/v1/${table}?${params}`,{method:'PATCH',headers:SB_H,body:JSON.stringify(body)}); } catch {}
}
async function sbDelete(table:string, params:string) {
  try { await fetch(`${SB_URL}/rest/v1/${table}?${params}`,{method:'DELETE',headers:SB_H}); } catch {}
}

// ─── STAFF ACCESS MANAGER ─────────────────────────────────────────────────────
const PERM_DEFS = [
  { key:'messages', label:'Messages',  icon:'💬', color:'#6FB8E8' },
  { key:'diet',     label:'Diet',      icon:'🥗', color:'#4FD89A' },
  { key:'labs',     label:'Labs',      icon:'🔬', color:'#D4A8F0' },
  { key:'workout',  label:'Workout',   icon:'🏋️', color:'#f06060' },
  { key:'checkins', label:'Check-ins', icon:'✅', color:B.gold    },
  { key:'habits',   label:'Habits',    icon:'🌱', color:'#88ddaa' },
];
const DEFAULT_PERMS:any = { messages:true, diet:false, labs:false, workout:false, checkins:false, habits:false };

const FALLBACK_STAFF:any[]   = [
  { id:'s1', name:'Coach Marcus',   role:'coach',      initials:'CM' },
  { id:'s2', name:'Head Coach Nia', role:'head_coach', initials:'HN' },
  { id:'s3', name:'Sarah (VA)',      role:'va',         initials:'SA' },
];
const FALLBACK_CLIENTS:any[] = [
  { id:'c1', name:'Jordan Williams', initials:'JW' },
  { id:'c2', name:'Alex Carter',     initials:'AC' },
  { id:'c3', name:'Taylor Brooks',   initials:'TB' },
  { id:'c4', name:'Sam Rivera',      initials:'SR' },
];

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
      sbGet('user_profiles', `company_id=eq.${me.company_id}&role=neq.client&select=id,name,role,initials,email`),
      sbGet('user_profiles', `company_id=eq.${me.company_id}&role=eq.client&select=id,name,initials`),
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
      if (!usingDemo) await sbPatch('client_access', `id=eq.${editing.id}`, { permissions:fPerms });
      setAssignments(p => p.map(a => a.id===editing.id ? {...a,permissions:fPerms} : a));
    } else {
      const payload = { company_id:companyId, staff_id:fStaff, client_id:fClient==='all'?null:fClient, permissions:fPerms, assigned_by:adminId };
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
              <p style={{ fontSize:13, fontWeight:700, color:B.text, margin:0 }}>{staff.name}</p>
              <p style={{ fontSize:10, color:B.muted, margin:0, textTransform:'capitalize' }}>{staffRole(staff.id)}</p>
            </div>
          </div>

          {rows.map((a:any) => {
            const active = PERM_DEFS.filter(p => a.permissions?.[p.key]);
            return (
              <Card key={a.id} style={{ marginBottom:8, marginLeft:46 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:12, fontWeight:700, color:B.text, margin:'0 0 8px' }}>{clientLabel(a.client_id)}</p>
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
                  {clientList.map((c:any) => <option key={c.id} value={c.id}>👤 {c.name}</option>)}
                </select>
              </div>
            </>)}

            {editing && (
              <div style={{ padding:'10px 12px', background:B.surface, borderRadius:8, marginBottom:18 }}>
                <p style={{ fontSize:12, color:B.muted, margin:'0 0 2px' }}>Editing access for</p>
                <p style={{ fontSize:13, fontWeight:700, color:B.gold, margin:0 }}>{staffName(editing.staff_id)} → {clientLabel(editing.client_id)}</p>
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

// ─── ADMIN CONVERSATION MONITOR ──────────────────────────────────────────────
const AdminConversationMonitor = ({ user }:any) => {
  const isMobile = useIsMobile();
  const [convos,      setConvos]      = useState<any[]>([]);
  const [profiles,    setProfiles]    = useState<Record<string,any>>({});
  const [selected,    setSelected]    = useState<any>(null);
  const [messages,    setMessages]    = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [ready,       setReady]       = useState(false);
  const [msgLoading,  setMsgLoading]  = useState(false);

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
            <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:'uppercase', margin:0 }}>
              All Conversations ({convos.length})
            </p>
          </div>
          {convos.length===0 && <div style={{ padding:28, textAlign:'center', color:B.muted, fontSize:12 }}>No conversations yet</div>}
          {convos.map((c:any) => {
            const isActive = selected?.id===c.id;
            return (
              <button key={c.id} onClick={()=>openConvo(c)}
                style={{ width:'100%', padding:'13px 16px', background:isActive?`${B.gold}15`:'transparent',
                  borderLeft:`3px solid ${isActive?B.gold:'transparent'}`, border:'none',
                  borderBottom:`1px solid ${B.border}`, cursor:'pointer', textAlign:'left' }}>
                <p style={{ fontSize:12, fontWeight:700, color:isActive?B.gold:B.text, margin:'0 0 2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {pName(c.participant_a_id)} ↔ {pName(c.participant_b_id)}
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
              <p style={{ fontSize:13, fontWeight:700, color:B.text, margin:0 }}>{pName(selected.participant_a_id)} ↔ {pName(selected.participant_b_id)}</p>
              <p style={{ fontSize:10, color:B.muted, margin:0 }}>Admin read-only · HIPAA audit log active</p>
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
                    {pInit(msg.sender_id)}
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:B.muted }}>{pName(msg.sender_id)}</span>
                  {msg.created_at && <span style={{ fontSize:9, color:B.border }}>{new Date(msg.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>}
                </div>
                <div style={{ marginLeft:28, background:B.card, border:`1px solid ${B.border}`, borderRadius:'4px 12px 12px 12px', padding:'9px 13px' }}>
                  <p style={{ fontSize:13, color:B.text, margin:0, lineHeight:1.55, wordBreak:'break-word' }}>{msg.content||'📎 File attachment'}</p>
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
    const specific = access.filter((a:any)=>a.client_id).map((a:any)=>a.client_id);
    const compWide  = access.find((a:any)=>!a.client_id);
    let clientRows:any[] = compWide
      ? await sbGet('user_profiles', `company_id=eq.${me.company_id}&role=eq.client&order=name.asc`) || []
      : specific.length ? await sbGet('user_profiles', `id=in.(${specific.join(',')})&order=name.asc`) || [] : [];
    const pm:Record<string,any> = {};
    for (const c of clientRows) {
      const sp = access.find((a:any)=>a.client_id===c.id);
      const cw = access.find((a:any)=>!a.client_id);
      pm[c.id] = {...(cw?.permissions||{}), ...(sp?.permissions||{})};
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
                    {(c.initials||c.name[0]).slice(0,2)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight:700, color:isAct?B.gold:B.text, margin:'0 0 4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</p>
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

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────
const AdminDashboard = ({ user }:any) => {
  const isMobile = useIsMobile();
  const [adminTab, setAdminTab] = useState('overview');
  const orgs = [
    { name:"Lifestyle of Eden", coaches:3, clients:24, color:B.gold },
    { name:"Partner Brand Co.", coaches:2, clients:11, color:"#6FB8E8" },
    { name:"Elite Performance", coaches:1, clients:6,  color:"#4FD89A" },
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
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap:10, marginBottom:20 }}>
              {[{label:"Organizations",val:orgs.length},{label:"Total Coaches",val:6},{label:"Total Clients",val:41},{label:"MRR",val:"$4.2k"}].map(({label,val})=>(
                <Card key={label} style={{ textAlign:"center" }}>
                  <p style={{ fontSize:20, fontWeight:700, color:B.gold, margin:"0 0 4px" }}>{val}</p>
                  <p style={{ fontSize:9, color:B.muted, margin:0, lineHeight:1.3 }}>{label}</p>
                </Card>
              ))}
            </div>
            <p style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 12px" }}>Organizations</p>
            {orgs.map((o,i)=>(
              <Card key={i} style={{ marginBottom:10, borderLeft:`3px solid ${o.color}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <p style={{ fontSize:14, fontWeight:700, color:B.text, margin:"0 0 4px" }}>{o.name}</p>
                    <p style={{ fontSize:11, color:B.muted, margin:0 }}>{o.coaches} coaches · {o.clients} clients</p>
                  </div>
                  <Btn variant="ghost" style={{ fontSize:11, padding:"4px 0" }}>Manage →</Btn>
                </div>
              </Card>
            ))}
            <Divider/>
            <p style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 12px" }}>Platform Actions</p>
            {["Add New Organization","Add Coach Account","View All Client Data","Audit Log","Zapier / GHL Webhooks","Stripe Subscription Overview"].map(action=>(
              <button key={action} style={{ width:"100%", background:B.card, border:`1px solid ${B.border}`, borderRadius:10, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", marginBottom:8, textAlign:"left" }}>
                <span style={{ fontSize:13, color:B.text }}>{action}</span>
                <span style={{ color:B.gold }}>→</span>
              </button>
            ))}
            <div style={{ marginTop:12, padding:"12px 14px", background:`${B.gold}11`, border:`1px solid ${B.gold}33`, borderRadius:10 }}>
              <p style={{ fontSize:11, fontWeight:700, color:B.gold, margin:"0 0 4px" }}>🔒 HIPAA COMPLIANCE STATUS</p>
              <p style={{ fontSize:12, color:B.muted, margin:0 }}>AES-256 encryption active · Audit logs enabled · BAA on file · Last access review: Jul 13 2026</p>
            </div>
          </div>
        </div>
      )}

      {/* Staff Access */}
      {adminTab==='access' && <StaffAccessManager user={user}/>}

      {/* Conversations — admin reads all coach↔client threads */}
      {adminTab==='convos' && <AdminConversationMonitor user={user}/>}
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

  // Determine UUID — works for demo (Jordan) and live Supabase users
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
        method:'POST', headers:{ 'apikey':SB_ANON, 'Authorization':`Bearer ${SB_ANON}`, 'Content-Type':file.type }, body:file,
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

const AppShell = ({ user, onLogout }) => {
  const [tab, setTab]           = useState("home");
  const [loomMode,     setLoomMode]     = useState(false);
  const [loomFeatured, setLoomFeatured] = useState<Set<string>>(new Set());
  const [coachClient, setCoachClient] = useState<{email:string,name:string,role:string}|null>(null);
  const [followedUp, setFollowedUp]   = useState<Set<string>>(new Set());
  const [splitView,        setSplitView]        = useState(false);
  const [leftPanel,        setLeftPanel]        = useState('checkin');
  const [rightPanel,       setRightPanel]       = useState('msgs');
  const [splitRatio,       setSplitRatio]       = useState(50);
  const [clientNavSource,  setClientNavSource]  = useState<string>('admin'); // where to go on back
  const splitDragging = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  // Helper: navigate into a client tool, remembering where we came from
  const openClientTool = (dest: string, client: any, source = 'admin') => {
    setCoachClient(client);
    setTab(dest);
    setClientNavSource(source);
  };
  const isMobile = useIsMobile();

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
  ];

  const tabs = user.role === "super_admin" ? adminTabs
             : user.role === "coach"       ? coachTabs
             : isStaff                     ? staffTabs
             : clientTabs;

  const SPLIT_PANELS = [
    { key:'msgs',    label:'Messages',  icon:'chat' },
    { key:'checkin', label:'Check-in',  icon:'assignment' },
    { key:'diet',    label:'Diet',      icon:'restaurant' },
    { key:'workout', label:'Program',   icon:'fitness_center' },
    { key:'labs',    label:'Labs',      icon:'biotech' },
  ];

  const renderPanel = (panelTab: string) => {
    const toolUser = (user.role === 'coach' || user.role === 'super_admin') && coachClient
      ? { ...coachClient, role: user.role }
      : { email: user.email, name: user.name, role: user.role };
    const ciEmail = ((user.role === 'coach' || user.role === 'super_admin') && coachClient)
      ? coachClient.email : user.email;
    const ciDemoCheckins = CLIENT_ROSTER.find((c:any) => c.email === ciEmail)?.checkinHistory ?? [];
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
      return <StaffClientPanel user={user}/>;
    }
    // Shared screens
    if (tab === "home")      return <HomeScreen user={user}/>;
    if (tab === "msgs")      return <Messaging currentUser={{ email: user.email, name: user.name, role: user.role }} loomMode={loomMode} loomFeatured={loomFeatured} initialConvoName={coachClient?.name}/>;
    // When a coach navigates into a client tool, pass the client's email/name for
    // data context but keep the coach's role so components show the editable coach view
    const toolUser = (user.role === "coach" || user.role === "super_admin") && coachClient
      ? { ...coachClient, role: user.role }
      : { email: user.email, name: user.name, role: user.role };
    // Resolve CLIENT_ROSTER demo check-in data for whichever client is in context
    const ciEmail = ((user.role === "coach" || user.role === "super_admin") && coachClient)
      ? coachClient.email
      : user.email;
    const ciDemoCheckins = CLIENT_ROSTER.find(c => c.email === ciEmail)?.checkinHistory ?? [];
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
                                          setLoomFeatured={setLoomFeatured}/>;
    if (tab === "wearables") return <Wearables currentUser={toolUser}/>;
    if (tab === "team")      return <Week7 currentUser={{ email: user.email, name: user.name, role: user.role }}/>;
    if (tab === "learn")     return <Week5 currentUser={{ email: user.email, name: user.name, role: user.role }}/>;
    if (tab === "community") return <CommunityScreen user={user}/>;
    return <HomeScreen user={user}/>;
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", width:"100%", background:B.black, overflow:"hidden" }}>
      {/* Top bar */}
      <div style={{ background:B.surface, borderBottom:`1px solid ${B.border}`, padding:"8px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <HoneycombLogo size={30}/>
          <div>
            <p style={{ fontSize:13, fontWeight:700, color:B.text, margin:0 }}>Eden Communications</p>
            {!isMobile && <p style={{ fontSize:9, color:B.muted, margin:0, letterSpacing:0.5 }}>🔒 HIPAA Secure · edencommunications.io</p>}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:isMobile?8:12 }}>
          {/* Split View toggle — coach/admin, desktop only */}
          {(user.role === "coach" || user.role === "super_admin") && !isMobile && (
            <button onClick={() => setSplitView(v => !v)}
              title={splitView ? "Exit Split View" : "Split View — see two panels side by side"}
              style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2,
                background: splitView ? `${B.gold}22` : "transparent",
                border:`1.5px solid ${splitView ? B.gold : B.border}`,
                borderRadius:8, padding:"4px 8px", cursor:"pointer" }}>
              <span style={{ fontSize:15 }}>⊟</span>
              <span style={{ fontSize:8, fontWeight:700, letterSpacing:.6, textTransform:"uppercase",
                color: splitView ? B.gold : B.muted }}>
                {splitView ? "Split ON" : "Split"}
              </span>
            </button>
          )}
          {/* Loom Mode toggle — coach only, persists across all tabs */}
          {user.role === "coach" && (
            <button onClick={() => setLoomMode(v => !v)}
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
          <Notifications currentUser={{ email: user.email, name: user.name, role: user.role }} onNavigate={setTab}/>
          <div style={{ width:30, height:30, borderRadius:15, background:B.gold, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:13, fontWeight:800, color:B.black }}>{user.name[0]}</span>
          </div>
          <button onClick={onLogout} style={{ background:"none", border:`1px solid ${B.border}`, borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", gap:5, padding:"5px 10px" }}>
            <Ic n="logout" size={14} c={B.muted}/>
            {!isMobile && <span style={{ fontSize:11, color:B.muted }}>Sign out</span>}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"row" }}>

        {/* Sidebar — desktop only */}
        {!isMobile && (
          <div style={{ width:200, background:B.surface, borderRight:`1px solid ${B.border}`, flexShrink:0, display:"flex", flexDirection:"column", padding:"12px 0" }}>
            <div style={{ padding:"0 14px 16px", borderBottom:`1px solid ${B.border}`, marginBottom:8 }}>
              <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, margin:0, textTransform:"uppercase" }}>
                {user.role === "super_admin" ? "Super Admin" : user.role === "coach" ? "Coach Portal" : "My Dashboard"}
              </p>
              <p style={{ fontSize:12, color:B.gold, margin:"3px 0 0", fontWeight:600 }}>{user.name}</p>
            </div>
            {tabs.map(t => (
              <button key={t.key} onClick={() => { if(t.key==='admin') setCoachClient(null); setTab(t.key); }}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:tab===t.key?`${B.gold}15`:"none", border:"none", borderLeft:`3px solid ${tab===t.key?B.gold:"transparent"}`, cursor:"pointer", textAlign:"left", width:"100%" }}>
                <Ic n={t.icon} size={17} c={tab===t.key?B.gold:B.muted}/>
                <span style={{ fontSize:13, fontWeight:tab===t.key?700:400, color:tab===t.key?B.gold:B.muted }}>{t.label}</span>
              </button>
            ))}
            <div style={{ marginTop:"auto", padding:"12px 14px", borderTop:`1px solid ${B.border}` }}>
              <div style={{ padding:"8px 10px", background:B.goldDim, border:`1px solid ${B.goldMid}`, borderRadius:8 }}>
                <p style={{ fontSize:9, color:B.gold, margin:0, fontWeight:700, letterSpacing:0.8 }}>LIFESTYLE OF EDEN</p>
                <p style={{ fontSize:10, color:B.muted, margin:"2px 0 0" }}>Powered by Eden Comms</p>
              </div>
            </div>
          </div>
        )}


        {/* Main content area */}
        <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", background:B.black }}>
          {splitView && !isMobile ? (
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
          ) : renderScreen()}
        </div>
      </div>

      {/* Bottom nav — mobile only */}
      {isMobile && (
        <div style={{ background:B.surface, borderTop:`1px solid ${B.border}`, display:"flex", flexShrink:0,
          paddingBottom:"env(safe-area-inset-bottom, 0px)", overflowX:"auto",
          WebkitOverflowScrolling:"touch", scrollbarWidth:"none" }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => { if(t.key==='admin') setCoachClient(null); setTab(t.key); }}
              style={{ minWidth:60, flex: tabs.length <= 6 ? 1 : undefined,
                display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                background:"none", border:"none", cursor:"pointer", padding:"6px 4px 8px", flexShrink:0 }}>
              <Ic n={t.icon} size={20} c={tab===t.key?B.gold:B.muted}/>
              <span style={{ fontSize:9, fontWeight:600, color:tab===t.key?B.gold:B.muted,
                letterSpacing:0.4, textTransform:"uppercase", whiteSpace:"nowrap" }}>{t.label}</span>
            </button>
          ))}
        </div>
      )}

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
              For HIPAA security, you'll be signed out automatically due to inactivity.
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
    </div>
  );
};

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authScreen, setAuthScreen] = useState("login");

  if (!user) {
    if (authScreen === "forgot") return <ForgotScreen onBack={()=>setAuthScreen("login")}/>;
    if (authScreen === "signup") return <SignupScreen onBack={()=>setAuthScreen("login")}/>;
    return <LoginScreen onLogin={setUser} onForgot={()=>setAuthScreen("forgot")} onSignup={()=>setAuthScreen("signup")}/>;
  }

  return (
    <AuthContext.Provider value={{ user, logout:()=>setUser(null) }}>
      <AppShell user={user} onLogout={()=>setUser(null)}/>
      <InstallBanner />
    </AuthContext.Provider>
  );
}
