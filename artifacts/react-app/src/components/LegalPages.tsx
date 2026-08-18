// LegalPages — public Terms of Service and Privacy Policy pages.
// Reachable pre-auth at /terms and /privacy (reserved path segments in App.tsx).
// General verbiage covering the coaching platform: accounts, health/coaching
// content disclaimers, messaging & communities, wearables, media uploads.

const B = {
  black: "#000000", card: "#0d0d0d", border: "#1a1a1a",
  text: "#eaeaea", muted: "#888888", gold: "#d4af37",
};

const EFFECTIVE_DATE = "August 18, 2026";

const S = ({ title, children }: any) => (
  <section style={{ marginBottom: 28 }}>
    <h2 style={{ fontSize: 16, fontWeight: 800, color: B.text, margin: "0 0 10px" }}>{title}</h2>
    <div style={{ fontSize: 13, color: B.muted, lineHeight: 1.75 }}>{children}</div>
  </section>
);

const P = ({ children }: any) => <p style={{ margin: "0 0 10px" }}>{children}</p>;

const LegalShell = ({ heading, children }: any) => {
  const base = (import.meta.env.BASE_URL || "/");
  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg, #1a1200 0%, ${B.black} 30%)`, padding: "40px 20px 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <a href={base} style={{ fontSize: 12, color: B.gold, textDecoration: "none" }}>← Back to app</a>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: B.text, margin: "18px 0 4px" }}>{heading}</h1>
        <p style={{ fontSize: 11, color: B.muted, margin: "0 0 28px" }}>Effective date: {EFFECTIVE_DATE}</p>
        <div style={{ background: B.card, border: `1px solid ${B.border}`, borderRadius: 14, padding: "26px 24px" }}>
          {children}
        </div>
        <p style={{ fontSize: 11, color: "#444444", textAlign: "center", marginTop: 24 }}>
          <a href={`${base}terms`} style={{ color: B.muted, textDecoration: "none", marginRight: 14 }}>Terms &amp; Conditions</a>
          <a href={`${base}privacy`} style={{ color: B.muted, textDecoration: "none" }}>Privacy Policy</a>
        </p>
      </div>
    </div>
  );
};

export const TermsPage = () => (
  <LegalShell heading="Terms & Conditions">
    <S title="1. Acceptance of These Terms">
      <P>These Terms &amp; Conditions ("Terms") govern your access to and use of the Eden Communications platform, including any white-label or sub-branded versions of it operated for coaching organizations (collectively, the "Service"). By creating an account, logging in, or using the Service, you agree to these Terms. If you do not agree, do not use the Service.</P>
    </S>
    <S title="2. Description of the Service">
      <P>The Service is a private coaching and wellness platform that may include: personalized nutrition, supplement, training, and lifestyle protocols; weekly check-ins and progress tracking; messaging with your coach and care team; group communities; video huddles; educational content and courses; and optional integrations with wearable devices.</P>
      <P>Access to the Service is typically provided as part of a coaching program you have purchased from your coach or coaching organization. Your relationship with your coach — including fees, refunds, and program scope — is governed by your agreement with that coach or organization.</P>
    </S>
    <S title="3. Not Medical Advice">
      <P>The Service and all content provided through it — including nutrition plans, supplement protocols, prescription tracking tools, training recommendations, and educational materials — are provided for informational and coaching purposes only. They are <strong style={{ color: B.text }}>not medical advice, diagnosis, or treatment</strong>, and no coach-client relationship through the Service creates a doctor-patient relationship.</P>
      <P>Always consult a qualified healthcare professional before starting, stopping, or changing any medication, supplement, diet, or exercise program. Never disregard professional medical advice because of something you saw in the Service. If you believe you have a medical emergency, call your local emergency number immediately.</P>
    </S>
    <S title="4. Accounts and Security">
      <P>Accounts are created for you by your coach or organization. You are responsible for keeping your login credentials confidential and for all activity under your account. Notify your coach or organization promptly if you suspect unauthorized use. You must provide accurate information and be at least 18 years old (or the age of majority in your jurisdiction) to use the Service.</P>
    </S>
    <S title="5. Acceptable Use">
      <P>You agree not to: (a) use the Service for any unlawful purpose; (b) harass, abuse, or harm other users in messages or communities; (c) upload content that is illegal, infringing, obscene, or malicious; (d) attempt to access other users' data or interfere with the operation of the Service; (e) scrape, copy, or resell the Service or its content; or (f) share program materials outside your own use without permission.</P>
      <P>Coaches and administrators may moderate community and message content, and we may remove content or suspend accounts that violate these Terms.</P>
    </S>
    <S title="6. Your Content">
      <P>You retain ownership of the content you submit — check-ins, notes, messages, photos, and files. By submitting content, you grant us and your coaching organization a limited license to store, display, and process that content solely to operate and provide the Service (for example, showing your check-in to your coach).</P>
    </S>
    <S title="7. Health Data and Wearables">
      <P>If you choose to connect a wearable device or health integration (such as a smart ring), you authorize the Service to receive and display that data for you and your coach. You can disconnect an integration at any time. Wearable data is informational and subject to the same "not medical advice" limitations above.</P>
    </S>
    <S title="8. Intellectual Property">
      <P>The Service, its design, software, and all content provided by us or your coaching organization (programs, courses, guides, branding) are protected by intellectual-property laws and remain the property of their respective owners. You receive a personal, non-transferable, revocable license to use them within the Service for your own program.</P>
    </S>
    <S title="9. Payments">
      <P>Payments for coaching programs are handled between you and your coach or coaching organization, under their terms. The Service itself does not process your program payments unless expressly stated otherwise.</P>
    </S>
    <S title="10. Termination">
      <P>Your coach or organization may deactivate your account when your program ends or per your agreement with them. We may suspend or terminate access for violations of these Terms. Sections that by their nature should survive termination (including disclaimers, limitations of liability, and content licenses needed for record-keeping) survive.</P>
    </S>
    <S title="11. Disclaimers">
      <P>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE, OR THAT ANY PARTICULAR HEALTH OR FITNESS RESULT WILL BE ACHIEVED.</P>
    </S>
    <S title="12. Limitation of Liability">
      <P>TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE AND YOUR COACHING ORGANIZATION WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF DATA, PROFITS, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE WILL NOT EXCEED THE AMOUNT YOU PAID FOR ACCESS TO THE SERVICE IN THE TWELVE MONTHS BEFORE THE CLAIM AROSE, OR ONE HUNDRED U.S. DOLLARS IF YOU PAID NOTHING.</P>
    </S>
    <S title="13. Changes to These Terms">
      <P>We may update these Terms from time to time. If we make material changes, we will update the effective date above and may notify you in the app. Continuing to use the Service after changes take effect means you accept the updated Terms.</P>
    </S>
    <S title="14. Contact">
      <P>Questions about these Terms? Contact your coach or coaching organization, or reach the platform team through edencommunications.io.</P>
    </S>
  </LegalShell>
);

export const PrivacyPage = () => (
  <LegalShell heading="Privacy Policy">
    <S title="1. Overview">
      <P>This Privacy Policy explains how the Eden Communications platform, including white-label and sub-branded versions of it (the "Service"), collects, uses, and protects your information. Your account is typically administered by your coach or coaching organization, who also has access to the information you share in your program.</P>
    </S>
    <S title="2. Information We Collect">
      <P><strong style={{ color: B.text }}>Account information:</strong> name, email address, role, and the organization or coach you belong to.</P>
      <P><strong style={{ color: B.text }}>Program and wellness information you provide:</strong> weekly check-ins (weight, measurements, energy, sleep, stress, habits, notes), nutrition and supplement details, prescription notes you choose to record, goals, progress photos, and files you upload.</P>
      <P><strong style={{ color: B.text }}>Communications:</strong> messages with your coach and care team, community posts, and reactions.</P>
      <P><strong style={{ color: B.text }}>Wearable data (optional):</strong> if you connect a wearable device, we receive metrics such as sleep, readiness, and activity from that provider with your authorization.</P>
      <P><strong style={{ color: B.text }}>Technical information:</strong> basic log and device information needed to operate the Service securely (such as login events and notification delivery).</P>
    </S>
    <S title="3. How We Use Your Information">
      <P>We use your information to: provide and personalize your coaching program; let your coach and authorized team members review your progress and respond to you; deliver messages, reminders, and notifications you've enabled; operate communities and video sessions; maintain security and prevent abuse; and comply with legal obligations. We do <strong style={{ color: B.text }}>not sell</strong> your personal information.</P>
    </S>
    <S title="4. Who Can See Your Information">
      <P>Your coach and, depending on your organization's settings, authorized staff of your coaching organization can see the program information you submit. Community posts are visible to members of that community. Direct messages are visible to the participants of the conversation and, for moderation and safety, to your organization's administrators where permitted.</P>
    </S>
    <S title="5. Service Providers">
      <P>We use trusted third-party providers to operate the Service — for example, secure database and authentication hosting, email delivery for account and program notifications, video-session infrastructure, and wearable-data providers you choose to connect. These providers process data only as needed to provide their services to us.</P>
    </S>
    <S title="6. Data Security">
      <P>Data is encrypted in transit, access is restricted by role (clients see their own data; staff access is scoped by their organization and permissions), and sensitive credentials are never stored in plain text. No system is perfectly secure, so please use a strong, unique password and keep it confidential.</P>
    </S>
    <S title="7. Data Retention">
      <P>We retain your information for as long as your account exists and as needed for your organization's legitimate record-keeping, dispute-resolution, and legal-compliance purposes. When your program ends, your account may be deactivated; you may request deletion of your personal information as described below.</P>
    </S>
    <S title="8. Your Choices and Rights">
      <P>You can: update your profile information in the app; disconnect wearable integrations at any time; control notification preferences; and request a copy, correction, or deletion of your personal information by contacting your coach or coaching organization. Depending on where you live, you may have additional rights under local privacy laws (such as GDPR or CCPA), and we will honor valid requests as required by law.</P>
    </S>
    <S title="9. Children">
      <P>The Service is not directed to children under 18, and we do not knowingly collect personal information from them. If you believe a minor has an account, contact the coaching organization so it can be removed.</P>
    </S>
    <S title="10. International Users">
      <P>The Service is operated from the United States. If you access it from elsewhere, you consent to your information being processed in the United States and other locations where our service providers operate.</P>
    </S>
    <S title="11. Changes to This Policy">
      <P>We may update this Privacy Policy from time to time. Material changes will be reflected in the effective date above and may be announced in the app. Continued use of the Service after changes take effect means you accept the updated policy.</P>
    </S>
    <S title="12. Contact">
      <P>Privacy questions or requests? Contact your coach or coaching organization, or reach the platform team through edencommunications.io.</P>
    </S>
  </LegalShell>
);
