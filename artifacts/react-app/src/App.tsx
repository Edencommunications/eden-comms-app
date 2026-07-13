import { useState, useEffect, createContext, useContext } from "react";

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
    upload:   <><polyline points="16,16 12,12 8,16" fill="none" stroke={c} strokeWidth="1.8"/><line x1="12" y1="12" x2="12" y2="21" stroke={c} strokeWidth="1.8"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" fill="none" stroke={c} strokeWidth="1.8"/></>,
    shop:     <><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" fill="none" stroke={c} strokeWidth="1.8"/><line x1="3" y1="6" x2="21" y2="6" stroke={c} strokeWidth="1.8"/><path d="M16 10a4 4 0 0 1-8 0" fill="none" stroke={c} strokeWidth="1.8"/></>,
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

  return (
    <div style={{ minHeight:"100vh", width:"100%", background:"#000000", display:"flex" }}>
      {/* Left panel — branding */}
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

      {/* Right panel — login form */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40, minWidth:0 }}>
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
  const quickLinks = [
    { icon:"msg", label:"Messages", color:B.gold },
    { icon:"diet", label:"Diet Plan", color:"#4FD89A" },
    { icon:"checkin", label:"Check In", color:"#ffa600" },
    { icon:"habits", label:"Habits", color:"#6FB8E8" },
    { icon:"labs", label:"Labs", color:"#D4A8F0" },
    { icon:"photos", label:"Photos", color:"#F0A8C8" },
    { icon:"calendar", label:"Book Call", color:B.gold },
    { icon:"links", label:"Resources", color:"#4FD89A" },
  ];
  return (
    <Screen>
      {/* Header */}
      <div style={{ background:`linear-gradient(180deg, #1a1200 0%, #000000 100%)`, padding:"28px 20px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
          <div>
            <p style={{ fontSize:11, color:B.muted, fontWeight:700, letterSpacing:1, textTransform:"uppercase", margin:"0 0 4px" }}>Welcome back</p>
            <h1 style={{ fontSize:22, fontWeight:700, color:B.text, margin:0 }}>{user.name}</h1>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
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

      {/* Quick access grid */}
      <div style={{ padding:"20px 20px 0" }}>
        <p style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 12px" }}>Quick Access</p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10 }}>
          {quickLinks.map(({ icon, label, color }) => (
            <button key={label} style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:12, padding:"14px 8px", display:"flex", flexDirection:"column", alignItems:"center", gap:8, cursor:"pointer" }}>
              <Ic n={icon} size={22} c={color}/>
              <span style={{ fontSize:10, fontWeight:600, color:B.muted, textAlign:"center", lineHeight:1.3 }}>{label}</span>
            </button>
          ))}
        </div>
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
          { label:"🎙 Pillars Podcast Series", url:"https://lifestyleofeden.com" },
          { label:"📺 YouTube Channel", url:"https://youtube.com" },
          { label:"📸 Instagram", url:"https://instagram.com" },
          { label:"👥 Facebook Page", url:"https://facebook.com" },
          { label:"🛍 Eden Clothing", url:"https://lifestyleofeden.com/shop" },
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
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:8 }}>
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
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:12, color:B.text }}>{f.name}</span>
                    <span style={{ fontSize:11, color:B.muted }}>{f.cal}cal</span>
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
                    <span style={{ fontSize:18 }}>📄</span>
                    <span style={{ fontSize:12, color:B.gold, flex:1 }}>{f}</span>
                    <span style={{ fontSize:12, color:B.muted }}>View</span>
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
  const [form, setForm] = useState({ weight:"", temp:"", steps:"", sleep:"5", sleepNotes:"", bloating:"5", brainFog:"5", sexDrive:"5", energy:"5", hunger:"5", bowelCount:"", bowelType:"", heartRate:"", hrv:"", notes:"" });
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
          <Input label="Average Daily Steps" value={form.steps} onChange={set("steps")} placeholder="e.g. 9500"/>
          <Input label="Morning Resting Heart Rate (BPM)" value={form.heartRate} onChange={set("heartRate")} placeholder="e.g. 58"/>
          <Input label="HRV" value={form.hrv} onChange={set("hrv")} placeholder="e.g. 72"/>
        </Card>
        <Card style={{ marginBottom:12 }}>
          <p style={{ fontSize:12, fontWeight:700, color:B.gold, margin:"0 0 12px", letterSpacing:0.8 }}>WELLBEING SCALES</p>
          <Scale label="Sleep Quality" val={form.sleep} onChange={set("sleep")}/>
          <Scale label="Bloating (1=bad, 10=none)" val={form.bloating} onChange={set("bloating")}/>
          <Scale label="Brain Fog (1=extreme, 10=none)" val={form.brainFog} onChange={set("brainFog")}/>
          <Scale label="Sex Drive" val={form.sexDrive} onChange={set("sexDrive")}/>
          <Scale label="Energy" val={form.energy} onChange={set("energy")}/>
          <Scale label="Hunger (1=fine, 10=starving)" val={form.hunger} onChange={set("hunger")}/>
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
  const habits = ["Take supplements","Wake up at 5 AM","1 Gallon Water Daily","Workout","Cold Shower","20oz Lemon Water upon waking","8 Hour Sleep Window","Read 30 Minutes"];
  const days = ["M","T","W","T","F","S","S"];
  const [checked, setChecked] = useState({});
  const toggle = (h,d) => {
    const k = `${h}-${d}`;
    setChecked(c=>({...c,[k]:!c[k]}));
  };
  const weekTotal = h => days.filter((_,i)=>checked[`${h}-${i}`]).length;
  return (
    <Screen>
      <PageHeader title="Habit Tracker" subtitle="Week of Jul 7 – 13, 2026"/>
      <div style={{ padding:"16px 20px 40px" }}>
        <Card style={{ marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <p style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:0 }}>This Week</p>
            <div style={{ display:"flex", gap:8 }}>
              {days.map((d,i)=>(
                <span key={i} style={{ fontSize:11, fontWeight:700, color:B.muted, width:22, textAlign:"center" }}>{d}</span>
              ))}
              <span style={{ fontSize:11, fontWeight:700, color:B.muted, width:32, textAlign:"center" }}>Tot</span>
            </div>
          </div>
          {habits.map(h=>(
            <div key={h} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderTop:`1px solid ${B.border}` }}>
              <span style={{ fontSize:12, color:B.text, flex:1, marginRight:8 }}>{h}</span>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {days.map((_,i)=>{
                  const done = checked[`${h}-${i}`];
                  return (
                    <button key={i} onClick={()=>toggle(h,i)}
                      style={{ width:22, height:22, borderRadius:6, border:`1.5px solid ${done?B.gold:B.border}`, background:done?`${B.gold}33`:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {done && <span style={{ fontSize:12, color:B.gold }}>✓</span>}
                    </button>
                  );
                })}
                <span style={{ fontSize:12, fontWeight:700, color:weekTotal(h)>=5?B.success:weekTotal(h)>=3?B.gold:B.muted, width:32, textAlign:"center" }}>{weekTotal(h)}/7</span>
              </div>
            </div>
          ))}
        </Card>
        <div style={{ padding:"12px 14px", background:B.card, border:`1px solid ${B.border}`, borderRadius:10, display:"flex", justifyContent:"space-between" }}>
          <span style={{ fontSize:13, color:B.text }}>Overall Week Score</span>
          <span style={{ fontSize:14, fontWeight:700, color:B.gold }}>{Math.round(habits.reduce((a,h)=>a+weekTotal(h),0)/(habits.length*7)*100)}%</span>
        </div>
      </div>
    </Screen>
  );
};

// COACH VIEW
const CoachDashboard = ({ user }) => {
  const clients = [
    { name:"Jordan Williams", status:"Active", lastCheckin:"Jul 9", alert:true },
    { name:"Alex Martinez", status:"Active", lastCheckin:"Jul 8", alert:false },
    { name:"Taylor Reyes", status:"Active", lastCheckin:"Jul 7", alert:false },
    { name:"Sam Thompson", status:"Pending checkin", lastCheckin:"Jun 30", alert:true },
  ];
  return (
    <Screen>
      <div style={{ background:`linear-gradient(180deg,#111100 0%,#000000 100%)`, padding:"28px 20px 20px" }}>
        <p style={{ fontSize:11, color:B.muted, fontWeight:700, letterSpacing:1, margin:"0 0 4px" }}>COACH PORTAL</p>
        <h1 style={{ fontSize:22, fontWeight:700, color:B.text, margin:0 }}>{user.name}</h1>
        <p style={{ fontSize:12, color:B.muted, margin:"4px 0 0" }}>Lifestyle of Eden · {clients.length} active clients</p>
      </div>
      <div style={{ padding:"16px 20px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:20 }}>
          {[{label:"Total Clients",val:clients.length,color:B.gold},{label:"Check-Ins Due",val:2,color:"#ffa600"},{label:"Pending Labs",val:1,color:"#D4A8F0"}].map(({label,val,color})=>(
            <Card key={label} style={{ textAlign:"center" }}>
              <p style={{ fontSize:24, fontWeight:700, color, margin:"0 0 4px" }}>{val}</p>
              <p style={{ fontSize:10, color:B.muted, margin:0, lineHeight:1.3 }}>{label}</p>
            </Card>
          ))}
        </div>
        <p style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:1, textTransform:"uppercase", margin:"0 0 12px" }}>My Clients</p>
        {clients.map((c,i)=>(
          <Card key={i} style={{ marginBottom:10, borderLeft:`3px solid ${c.alert?"#ffa600":B.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <p style={{ fontSize:14, fontWeight:700, color:B.text, margin:"0 0 4px" }}>{c.name}</p>
                <p style={{ fontSize:11, color:B.muted, margin:0 }}>Last check-in: {c.lastCheckin}</p>
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                <Badge color={c.alert?"#ffa600":B.success}>{c.status}</Badge>
                <Btn variant="ghost" style={{ fontSize:11, padding:"4px 0" }}>View →</Btn>
              </div>
            </div>
          </Card>
        ))}
        <div style={{ marginTop:16 }}>
          <Btn variant="secondary" fullWidth><Ic n="upload" size={16} c={B.muted}/>Import Client from GHL</Btn>
        </div>
      </div>
    </Screen>
  );
};

// SUPER ADMIN VIEW
const AdminDashboard = ({ user }) => {
  const orgs = [
    { name:"Lifestyle of Eden", coaches:3, clients:24, color:B.gold },
    { name:"Partner Brand Co.", coaches:2, clients:11, color:"#6FB8E8" },
    { name:"Elite Performance", coaches:1, clients:6,  color:"#4FD89A" },
  ];
  return (
    <Screen>
      <div style={{ background:`linear-gradient(180deg,#111100 0%,#000000 100%)`, padding:"28px 20px 20px" }}>
        <p style={{ fontSize:11, color:B.gold, fontWeight:700, letterSpacing:1, margin:"0 0 4px" }}>🛡 SUPER ADMIN</p>
        <h1 style={{ fontSize:22, fontWeight:700, color:B.text, margin:0 }}>Eden Admin Panel</h1>
        <p style={{ fontSize:12, color:B.muted, margin:"4px 0 0" }}>Platform-wide access · edencommunications.io</p>
      </div>
      <div style={{ padding:"16px 20px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10, marginBottom:20 }}>
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
    </Screen>
  );
};

// ─── MAIN APP SHELL ───────────────────────────────────────────────────────────
const AppShell = ({ user, onLogout }) => {
  const [tab, setTab] = useState("home");

  const clientTabs = [
    { key:"home",    icon:"home",    label:"Home" },
    { key:"msgs",    icon:"msg",     label:"Messages" },
    { key:"diet",    icon:"diet",    label:"Diet" },
    { key:"checkin", icon:"checkin", label:"Check In" },
    { key:"labs",    icon:"labs",    label:"Labs" },
    { key:"habits",  icon:"habits",  label:"Habits" },
  ];
  const coachTabs = [
    { key:"home",   icon:"home",    label:"Home" },
    { key:"msgs",   icon:"msg",     label:"Messages" },
    { key:"diet",   icon:"diet",    label:"Diet" },
    { key:"labs",   icon:"labs",    label:"Labs" },
    { key:"habits", icon:"habits",  label:"Habits" },
  ];
  const adminTabs = [
    { key:"home",   icon:"home",   label:"Home" },
    { key:"msgs",   icon:"msg",    label:"Messages" },
    { key:"admin",  icon:"admin",  label:"Admin" },
    { key:"links",  icon:"links",  label:"Links" },
  ];

  const tabs = user.role === "super_admin" ? adminTabs : user.role === "coach" ? coachTabs : clientTabs;

  const renderScreen = () => {
    if (user.role === "super_admin") {
      if (tab === "home") return <AdminDashboard user={user}/>;
    }
    if (user.role === "coach") {
      if (tab === "home") return <CoachDashboard user={user}/>;
    }
    if (tab === "home")    return <HomeScreen user={user}/>;
    if (tab === "msgs")    return <MessagesScreen/>;
    if (tab === "diet")    return <DietScreen/>;
    if (tab === "labs")    return <LabsScreen/>;
    if (tab === "checkin") return <CheckInScreen/>;
    if (tab === "habits")  return <HabitTrackerScreen/>;
    if (tab === "admin")   return <AdminDashboard user={user}/>;
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
            <p style={{ fontSize:9, color:B.muted, margin:0, letterSpacing:0.5 }}>🔒 HIPAA Secure · edencommunications.io</p>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:30, height:30, borderRadius:15, background:B.gold, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:13, fontWeight:800, color:B.black }}>{user.name[0]}</span>
          </div>
          <button onClick={onLogout} style={{ background:"none", border:`1px solid ${B.border}`, borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", gap:5, padding:"5px 10px" }}>
            <Ic n="logout" size={14} c={B.muted}/>
            <span style={{ fontSize:11, color:B.muted }}>Sign out</span>
          </button>
        </div>
      </div>

      {/* Body: sidebar nav on wide screens, bottom nav on narrow */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"row" }}>

        {/* Sidebar — shows when wide enough */}
        <div style={{ width:200, background:B.surface, borderRight:`1px solid ${B.border}`, flexShrink:0, display:"flex", flexDirection:"column", padding:"12px 0" }}>
          <div style={{ padding:"0 14px 16px", borderBottom:`1px solid ${B.border}`, marginBottom:8 }}>
            <p style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:1, margin:0, textTransform:"uppercase" }}>
              {user.role === "super_admin" ? "Super Admin" : user.role === "coach" ? "Coach Portal" : "My Dashboard"}
            </p>
            <p style={{ fontSize:12, color:B.gold, margin:"3px 0 0", fontWeight:600 }}>{user.name}</p>
          </div>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
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

        {/* Main content area */}
        <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", background:B.black }}>
          {renderScreen()}
        </div>
      </div>
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
    </AuthContext.Provider>
  );
}
