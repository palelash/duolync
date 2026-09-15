import Link from "next/link";
import Navbar from "@/app/_components/layout/Navbar";
import Footer from "@/app/_components/layout/Footer";

export const metadata = {
  title: "Privacy Policy — Duolync",
  description: "Privacy Policy for Duolync. Learn how we collect, use, and protect your data on the creator-brand marketplace.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-page)" }}>
      <div
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: "var(--bg-navbar)",
          backdropFilter: "blur(18px)",
          borderBottom: "1px solid var(--border-card)",
        }}
      >
        <Navbar />
      </div>

      <main className="pt-32 pb-24">
        <div className="container mx-auto px-4 max-w-3xl">

          {/* Header */}
          <div className="mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-3">
              Legal
            </p>
            <h1
              className="font-display font-bold text-white mb-3"
              style={{ fontSize: "clamp(2rem, 4vw, 3rem)", lineHeight: 1.1 }}
            >
              Privacy Policy
            </h1>
            <p className="text-sm text-zinc-500">Last updated: September 15, 2026</p>
          </div>

          {/* Divider */}
          <div className="h-px mb-12" style={{ background: "var(--border-card)" }} />

          {/* Table of Contents */}
          <div
            className="mb-12 rounded-xl p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-card)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-4">
              Contents
            </p>
            <ol className="toc-list">
              <li><a href="#overview">Overview</a></li>
              <li><a href="#definitions">Definitions</a></li>
              <li><a href="#data-collected">Data We Collect</a></li>
              <li><a href="#social-oauth">Third-Party Social Media Data (OAuth)</a></li>
              <li><a href="#data-usage">How We Use Your Data</a></li>
              <li><a href="#moderation">Moderation &amp; Dispute Processing</a></li>
              <li><a href="#data-sharing">Data Sharing</a></li>
              <li><a href="#retention">Data Retention</a></li>
              <li><a href="#security">Security</a></li>
              <li><a href="#user-rights">Your Rights &amp; Data Deletion</a></li>
              <li><a href="#cookies">Cookies &amp; Tracking</a></li>
              <li><a href="#children">Children&apos;s Privacy</a></li>
              <li><a href="#changes">Policy Changes</a></li>
              <li><a href="#contact">Contact Us</a></li>
            </ol>
          </div>

          {/* Body */}
          <div className="prose-legal">

            {/* 1. Overview */}
            <h2 id="overview">Overview</h2>
            <p>
              Duolync (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates a two-sided marketplace that connects content creators
              (&ldquo;Creators&rdquo;) with brands and businesses (&ldquo;Brands&rdquo;) for collaboration and campaign management. This Privacy
              Policy describes how we collect, use, store, and protect information when you use our platform at{" "}
              <a href="https://duolync.com" target="_blank" rel="noopener noreferrer">duolync.com</a>.
            </p>
            <p>
              By creating an account or using the Service, you acknowledge that you have read and understood this
              Privacy Policy. If you do not agree with our data practices, please do not use the Service.
            </p>

            {/* 2. Definitions */}
            <h2 id="definitions">Definitions</h2>
            <p>For the purposes of this Privacy Policy:</p>
            <ul>
              <li><strong>Account</strong> means a unique account created for You to access our Service as either a Creator or a Brand.</li>
              <li><strong>Brand</strong> means a business, agency, or individual who uses Duolync to discover creators and manage sponsorship campaigns.</li>
              <li><strong>Creator</strong> means an individual content creator who uses Duolync to build a portfolio, connect social accounts, and find brand collaboration opportunities.</li>
              <li><strong>Campaign</strong> means a brand-initiated collaboration project managed on Duolync, including briefs, applications, deliverables, and payments.</li>
              <li><strong>Connected Social Account</strong> means any third-party social media account (Instagram, TikTok, YouTube, or other) that a Creator voluntarily links to their Duolync profile via OAuth.</li>
              <li><strong>OAuth</strong> means the open authorization protocol used to grant Duolync limited, scoped access to your social media account data without exposing your credentials.</li>
              <li><strong>Personal Data</strong> means any information that relates to an identified or identifiable natural person.</li>
              <li><strong>Usage Data</strong> means data collected automatically by the platform, such as page visits, session duration, and feature interactions.</li>
              <li><strong>Company</strong> (referred to as &ldquo;Duolync,&rdquo; &ldquo;We,&rdquo; &ldquo;Us,&rdquo; or &ldquo;Our&rdquo;) refers to Duolync, registered in Georgia.</li>
            </ul>

            {/* 3. Data We Collect */}
            <h2 id="data-collected">Data We Collect</h2>

            <h3>Account Information</h3>
            <p>When you register on Duolync, we collect:</p>
            <ul>
              <li>Full name and display name</li>
              <li>Email address and hashed password</li>
              <li>Account type (Creator or Brand)</li>
              <li>Profile photo or brand logo</li>
              <li>Country / region</li>
              <li>Bio, niche categories, and self-reported audience demographics (Creators)</li>
              <li>Company name, industry, and website (Brands)</li>
            </ul>

            <h3>Profile & Portfolio Data</h3>
            <p>Creators may voluntarily provide additional profile information including:</p>
            <ul>
              <li>Content niche and specializations</li>
              <li>Rate cards and collaboration preferences</li>
              <li>Past brand partnerships and portfolio links</li>
              <li>Media kit content</li>
            </ul>

            <h3>Usage Data</h3>
            <p>
              We automatically collect data about how you interact with the platform, including IP addresses,
              browser type, device identifiers, pages visited, features used, time spent, and click patterns.
              This data helps us improve the Service and personalize your experience.
            </p>

            {/* 4. Social OAuth */}
            <h2 id="social-oauth">Third-Party Social Media Data (OAuth)</h2>
            <p>
              A core feature of Duolync is the ability for Creators to connect their social media accounts —
              currently Instagram, TikTok, and YouTube — via OAuth authorization. This integration enables
              Creators to build verified, data-driven portfolios visible to Brands on the platform.
            </p>
            <p>
              <strong>When you connect a social account via OAuth, you explicitly authorize Duolync to access the
              following categories of data from that platform:</strong>
            </p>

            <h4>Instagram (via Meta Graph API)</h4>
            <ul>
              <li>Public profile information: username, display name, profile picture, and biography</li>
              <li>Follower count and following count</li>
              <li>Media posts: thumbnails, captions, media types, and post timestamps</li>
              <li>Engagement metrics: likes, comments, shares, and saves per post</li>
              <li>Reach and impressions data (where authorized by your Instagram account type)</li>
              <li>Story and Reel performance metrics (Insights API, business/creator accounts only)</li>
            </ul>

            <h4>TikTok (via TikTok for Developers API)</h4>
            <ul>
              <li>Public profile information: username, display name, avatar, and bio</li>
              <li>Follower count and following count</li>
              <li>Video posts: cover images, captions, durations, and publish dates</li>
              <li>Engagement metrics: likes, comments, shares, plays, and saves per video</li>
              <li>Profile-level view count and engagement rate calculations</li>
            </ul>

            <h4>YouTube (via YouTube Data API v3)</h4>
            <ul>
              <li>Channel public profile: channel name, handle, description, and avatar</li>
              <li>Subscriber count and total view count</li>
              <li>Public video library: titles, thumbnails, descriptions, and publish dates</li>
              <li>Video-level engagement: views, likes, comments, and estimated watch time</li>
              <li>Channel analytics summaries (requires YouTube Analytics scope authorization)</li>
            </ul>

            <h3>How Social Data Is Used on Duolync</h3>
            <ul>
              <li>
                <strong>Portfolio Display:</strong> Connected account data — including follower counts, engagement rates,
                and recent media posts — is displayed on your public Creator profile and portfolio grid, making it
                visible to Brands using the discovery and smart-match tools.
              </li>
              <li>
                <strong>Analytics Calculations:</strong> We calculate derived metrics such as average engagement rate,
                reach-to-follower ratio, and content frequency from the raw data provided by each social platform.
              </li>
              <li>
                <strong>Verification:</strong> Connected accounts are marked as &ldquo;verified&rdquo; on your profile, signaling
                to Brands that your metrics are sourced directly from the platform rather than self-reported.
              </li>
              <li>
                <strong>Smart Match:</strong> Social metrics are used by Duolync&apos;s algorithm to surface relevant
                Creator profiles to Brands based on niche, audience size, engagement, and campaign compatibility.
              </li>
            </ul>

            <h3>OAuth Scope Limitations</h3>
            <p>
              We request only the minimum OAuth scopes necessary to display the data listed above. We do not access,
              read, or store your private direct messages, drafts, payment information, or any content that is not
              publicly visible on your social profile. You may revoke Duolync&apos;s access to any connected social account
              at any time from your Duolync account settings or directly from the respective social platform&apos;s
              security settings.
            </p>

            <h3>Data Refresh</h3>
            <p>
              Social account data is periodically refreshed (typically every 24–72 hours) for as long as the OAuth
              connection remains active. Refreshing ensures your portfolio metrics stay current. If you disconnect a
              social account, we will stop collecting new data from that platform. Cached data (follower counts,
              post thumbnails) may be retained for up to 30 days before being removed from your profile.
            </p>

            {/* 5. Data Usage */}
            <h2 id="data-usage">How We Use Your Data</h2>
            <p>Duolync uses collected data for the following purposes:</p>
            <ul>
              <li>
                <strong>Marketplace Matching:</strong> To surface Creator profiles to Brands through discovery, search,
                and Smart Match based on audience size, niche, engagement, and campaign parameters.
              </li>
              <li>
                <strong>Campaign Management:</strong> To facilitate the full lifecycle of brand-creator collaborations —
                including campaign briefs, creator applications, proposal reviews, deliverable submissions, and
                status tracking.
              </li>
              <li>
                <strong>Analytics &amp; Reporting:</strong> To calculate platform-wide and per-campaign analytics,
                including reach, engagement benchmarks, and performance comparisons, for both Creators and Brands.
              </li>
              <li>
                <strong>Account Management:</strong> To authenticate you, maintain your session, and allow you to
                manage your profile, portfolio, settings, and preferences.
              </li>
              <li>
                <strong>Communications:</strong> To send transactional emails (campaign invitations, application updates,
                dispute notifications, account alerts) and, where you have opted in, platform news or product updates.
              </li>
              <li>
                <strong>Platform Safety:</strong> To detect, investigate, and act on policy violations, fraudulent
                activity, spam, and abusive behavior that violates our Terms of Service.
              </li>
              <li>
                <strong>Service Improvement:</strong> To analyze usage patterns, run A/B tests, and improve platform
                features, performance, and user experience.
              </li>
              <li>
                <strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and legitimate requests
                from public authorities.
              </li>
            </ul>

            {/* 6. Moderation & Disputes */}
            <h2 id="moderation">Moderation &amp; Dispute Processing</h2>
            <p>
              Duolync operates an internal moderation system to maintain a safe, professional, and trustworthy
              marketplace. To support this, we collect and process specific data categories related to reports,
              disputes, and communications.
            </p>

            <h3>User Reports</h3>
            <p>
              When a user submits a report against another user or a piece of content, we collect:
            </p>
            <ul>
              <li>The identity of the reporting user and the reported subject</li>
              <li>The category and description of the report</li>
              <li>Relevant content or communication evidence attached to the report</li>
              <li>Timestamps and platform context (e.g., campaign ID, message thread)</li>
            </ul>
            <p>
              This information is reviewed by Duolync&apos;s moderation team and may be retained in our moderation
              logs for up to 36 months to identify patterns of abusive behavior and support appeals.
            </p>

            <h3>Dispute Logs</h3>
            <p>
              When a formal dispute is raised between a Brand and a Creator (e.g., regarding deliverable quality,
              payment, or campaign terms), we collect and maintain a dispute record containing:
            </p>
            <ul>
              <li>All formal dispute submissions and responses from both parties</li>
              <li>Relevant campaign data, deliverables, contracts, and payment records</li>
              <li>Evidence submitted by either party (screenshots, files, messages)</li>
              <li>Admin decisions, warnings issued, and resolution outcomes</li>
            </ul>
            <p>
              Dispute records are processed by authorized Duolync administrators only, kept confidential between
              the involved parties and our team, and retained for up to 48 months for legal and audit purposes.
            </p>

            <h3>In-Platform Communications</h3>
            <p>
              Messages exchanged through Duolync&apos;s messaging system are stored on our servers. Message data may
              be accessed by Duolync administrators solely when:
            </p>
            <ul>
              <li>A formal dispute references the message thread</li>
              <li>A user report alleges abuse, harassment, or fraud within the conversation</li>
              <li>Access is required by law or court order</li>
            </ul>
            <p>
              We do not use message content for advertising purposes or sell message data to third parties.
            </p>

            <h3>Account Actions &amp; Audit Trail</h3>
            <p>
              Administrative actions (warnings issued, content removed, accounts suspended or banned) are logged
              in an internal audit trail. These records are used for accountability, appeals processing, and to
              enforce consistent moderation standards across the platform.
            </p>

            {/* 7. Data Sharing */}
            <h2 id="data-sharing">Data Sharing</h2>
            <p>
              We do not sell your Personal Data. We may share data in the following limited circumstances:
            </p>
            <ul>
              <li>
                <strong>Between Marketplace Participants:</strong> Creator profile data (including social metrics, bio,
                portfolio, and niche) is visible to Brands on the platform as part of the marketplace. Brands&apos; company
                profiles and campaign details are visible to Creators browsing opportunities.
              </li>
              <li>
                <strong>Service Providers:</strong> We work with trusted third-party providers for hosting, email
                delivery, analytics, and payment processing. These providers are contractually bound to handle data
                only as instructed by Duolync and in accordance with applicable law.
              </li>
              <li>
                <strong>Legal Requirements:</strong> We may disclose data to comply with a legal obligation, court order,
                or governmental request, or to protect the rights and safety of our users and the public.
              </li>
              <li>
                <strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, user data
                may be transferred as part of the transaction. We will notify affected users in advance.
              </li>
              <li>
                <strong>With Your Consent:</strong> We may share data for any other purpose with your explicit prior
                consent.
              </li>
            </ul>

            {/* 8. Retention */}
            <h2 id="retention">Data Retention</h2>
            <p>We retain different categories of data for different periods:</p>
            <ul>
              <li><strong>Account &amp; profile data</strong> — retained for the duration of your active account plus up to 24 months after deletion.</li>
              <li><strong>Connected social account data</strong> — refreshed data is removed within 30 days of disconnecting a social account; cached metrics may be retained up to 30 days.</li>
              <li><strong>Campaign &amp; collaboration records</strong> — retained for up to 48 months for financial, legal, and dispute resolution purposes.</li>
              <li><strong>Dispute &amp; moderation logs</strong> — retained for up to 48 months to support appeals and enforcement consistency.</li>
              <li><strong>In-platform messages</strong> — retained for up to 36 months, or longer if referenced in an active dispute.</li>
              <li><strong>Usage &amp; analytics data</strong> — retained for up to 24 months in aggregated or anonymized form.</li>
              <li><strong>Server logs</strong> (IP, access times) — retained for up to 12 months for security and troubleshooting.</li>
            </ul>
            <p>
              We may retain data beyond these periods where required by law, to establish or defend legal claims,
              or at your explicit request.
            </p>

            {/* 9. Security */}
            <h2 id="security">Security</h2>
            <p>
              We implement commercially reasonable technical and organizational measures to protect your Personal
              Data, including encryption in transit (TLS), hashed password storage, access controls, and regular
              security reviews. However, no method of data transmission or storage is 100% secure. We encourage
              you to use a strong, unique password and to enable any available two-factor authentication.
            </p>
            <p>
              In the event of a data breach that is likely to result in a high risk to your rights and freedoms,
              we will notify you without undue delay as required by applicable law.
            </p>

            {/* 10. User Rights */}
            <h2 id="user-rights">Your Rights &amp; Data Deletion</h2>
            <p>
              Depending on your jurisdiction, you may have some or all of the following rights regarding your
              Personal Data:
            </p>
            <ul>
              <li>
                <strong>Right of Access:</strong> Request a copy of the Personal Data we hold about you.
              </li>
              <li>
                <strong>Right to Rectification:</strong> Request correction of inaccurate or incomplete data.
              </li>
              <li>
                <strong>Right to Erasure (&ldquo;Right to be Forgotten&rdquo;):</strong> Request deletion of your Personal Data,
                subject to legal retention obligations.
              </li>
              <li>
                <strong>Right to Restriction:</strong> Request that we limit processing of your data in certain
                circumstances.
              </li>
              <li>
                <strong>Right to Data Portability:</strong> Receive a structured, machine-readable copy of data you
                have provided to us.
              </li>
              <li>
                <strong>Right to Object:</strong> Object to processing of your data for direct marketing or based on
                legitimate interests.
              </li>
              <li>
                <strong>Right to Withdraw Consent:</strong> Where processing is based on consent, withdraw it at any
                time without affecting the lawfulness of prior processing.
              </li>
            </ul>

            <h3>How to Exercise Your Rights</h3>
            <p>You can manage most of your data directly from your Duolync account:</p>
            <ul>
              <li>
                <strong>Edit profile &amp; account info:</strong> Go to{" "}
                <strong>Settings → Account</strong> to update your name, email, bio, and profile photo.
              </li>
              <li>
                <strong>Disconnect social accounts:</strong> Go to{" "}
                <strong>Settings → Connected Accounts</strong> to revoke Duolync&apos;s OAuth access to any social platform.
              </li>
              <li>
                <strong>Delete your account:</strong> Go to{" "}
                <strong>Settings → Account → Delete Account</strong>. Deleting your account initiates permanent removal
                of your profile, social connections, and portfolio data. Active campaign obligations should be
                resolved before deletion.
              </li>
              <li>
                <strong>Data requests:</strong> For access, portability, or erasure requests that cannot be fulfilled
                self-serve, email us at{" "}
                <a href="mailto:hello@duolync.com">hello@duolync.com</a> with the subject line
                &ldquo;Data Request.&rdquo; We will respond within 30 days.
              </li>
            </ul>

            {/* 11. Cookies */}
            <h2 id="cookies">Cookies &amp; Tracking</h2>
            <p>
              We use cookies and similar technologies to operate the Service and improve your experience:
            </p>
            <ul>
              <li>
                <strong>Essential Cookies</strong> — Required for authentication, session management, and platform
                security. Cannot be disabled without breaking core functionality.
              </li>
              <li>
                <strong>Preference Cookies</strong> — Remember your settings such as theme (dark/light mode) and
                notification preferences.
              </li>
              <li>
                <strong>Analytics Cookies</strong> — Help us understand how users interact with the platform (e.g.,
                page views, feature usage). We use aggregated, anonymized data only. Where required by law, these
                are only placed with your consent.
              </li>
            </ul>
            <p>
              You can control cookies through your browser settings. Disabling essential cookies may impair platform
              functionality.
            </p>

            {/* 12. Children */}
            <h2 id="children">Children&apos;s Privacy</h2>
            <p>
              The Service is intended for users aged 18 and over. We do not knowingly collect Personal Data from
              anyone under 18. If we become aware that a user under 18 has provided Personal Data, we will promptly
              delete that data and terminate the account. If you believe a minor has registered on our platform,
              please contact us at <a href="mailto:hello@duolync.com">hello@duolync.com</a>.
            </p>

            {/* 13. Changes */}
            <h2 id="changes">Policy Changes</h2>
            <p>
              We may update this Privacy Policy as our platform evolves or as required by law. When we make material
              changes, we will notify you by updating the &ldquo;Last updated&rdquo; date at the top of this page and, where
              appropriate, by sending an email notification to your registered address. Your continued use of the
              Service after changes take effect constitutes your acceptance of the revised Policy.
            </p>

            {/* 14. Contact */}
            <h2 id="contact">Contact Us</h2>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices,
              please contact us:
            </p>
            <ul>
              <li>
                By email:{" "}
                <a href="mailto:hello@duolync.com">hello@duolync.com</a>
              </li>
              <li>
                Through our contact page:{" "}
                <Link href="/contact">duolync.com/contact</Link>
              </li>
            </ul>
            <p>
              We will respond to all privacy-related inquiries within 30 days.
            </p>

          </div>

          {/* Back link */}
          <div className="mt-16 pt-10" style={{ borderTop: "1px solid var(--border-card)" }}>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white transition-colors duration-200"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </main>

      <Footer />

      <style>{`
        .prose-legal {
          color: #94a3b8;
          font-size: 0.9375rem;
          line-height: 1.8;
        }
        .prose-legal p {
          margin-bottom: 1.25rem;
        }
        .prose-legal h2 {
          font-family: var(--font-display, inherit);
          font-weight: 700;
          font-size: 1.35rem;
          color: #f1f5f9;
          margin-top: 2.75rem;
          margin-bottom: 0.75rem;
          scroll-margin-top: 6rem;
        }
        .prose-legal h3 {
          font-weight: 600;
          font-size: 1.05rem;
          color: #cbd5e1;
          margin-top: 2rem;
          margin-bottom: 0.5rem;
        }
        .prose-legal h4 {
          font-weight: 600;
          color: #94a3b8;
          margin-top: 1.5rem;
          margin-bottom: 0.4rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-size: 0.75rem;
        }
        .prose-legal ul {
          list-style: none;
          padding: 0;
          margin-bottom: 1.25rem;
        }
        .prose-legal ul li {
          position: relative;
          padding-left: 1.25rem;
          margin-bottom: 0.6rem;
        }
        .prose-legal ul li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0.65em;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #6d28d9;
        }
        .prose-legal a {
          color: #a78bfa;
          text-decoration: none;
          transition: color 0.2s;
        }
        .prose-legal a:hover {
          color: #fff;
        }
        .prose-legal strong {
          color: #e2e8f0;
          font-weight: 600;
        }
        /* TOC */
        .toc-list {
          list-style: none;
          padding: 0;
          margin: 0;
          counter-reset: toc;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .toc-list li {
          counter-increment: toc;
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
          font-size: 0.875rem;
          color: #64748b;
        }
        .toc-list li::before {
          content: counter(toc, decimal-leading-zero);
          font-size: 0.7rem;
          font-weight: 600;
          color: #6d28d9;
          letter-spacing: 0.05em;
          flex-shrink: 0;
        }
        .toc-list a {
          color: #94a3b8;
          text-decoration: none;
          transition: color 0.2s;
        }
        .toc-list a:hover {
          color: #a78bfa;
        }
      `}</style>
    </div>
  );
}
