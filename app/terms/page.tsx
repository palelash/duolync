import Link from "next/link";
import Navbar from "@/app/_components/layout/Navbar";
import Footer from "@/app/_components/layout/Footer";

export const metadata = {
  title: "Terms of Service — Duolync",
  description: "Terms of Service for Duolync. Read the rules governing our creator-brand marketplace.",
};

export default function TermsPage() {
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
              Terms of Service
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
              <li><a href="#acceptance">Acceptance of Terms</a></li>
              <li><a href="#definitions">Definitions</a></li>
              <li><a href="#marketplace">Marketplace Rules</a></li>
              <li><a href="#accounts">Account Responsibilities</a></li>
              <li><a href="#brands">Brand-Specific Terms</a></li>
              <li><a href="#creators">Creator-Specific Terms</a></li>
              <li><a href="#campaigns">Campaigns &amp; Collaborations</a></li>
              <li><a href="#content-ip">Content &amp; Intellectual Property</a></li>
              <li><a href="#disputes">Dispute Resolution &amp; Admin Authority</a></li>
              <li><a href="#prohibited">Prohibited Conduct</a></li>
              <li><a href="#termination">Termination &amp; Suspension</a></li>
              <li><a href="#liability">Limitation of Liability</a></li>
              <li><a href="#governing-law">Governing Law</a></li>
              <li><a href="#changes">Changes to Terms</a></li>
              <li><a href="#contact">Contact Us</a></li>
            </ol>
          </div>

          {/* Body */}
          <div className="prose-legal">

            {/* 1. Acceptance */}
            <h2 id="acceptance">Acceptance of Terms</h2>
            <p>
              Welcome to Duolync. By creating an account, accessing, or using the Duolync platform at{" "}
              <a href="https://duolync.com" target="_blank" rel="noopener noreferrer">duolync.com</a>{" "}
              (the &ldquo;Service&rdquo;), you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;), our{" "}
              <Link href="/privacy">Privacy Policy</Link>, and any additional guidelines or policies referenced herein.
            </p>
            <p>
              If you do not agree with any part of these Terms, you may not access or use the Service. You represent
              that you are at least 18 years of age and have the legal capacity to enter into a binding agreement.
              If you are using the Service on behalf of a company or organization, you represent that you have the
              authority to bind that entity to these Terms.
            </p>

            {/* 2. Definitions */}
            <h2 id="definitions">Definitions</h2>
            <p>For the purposes of these Terms:</p>
            <ul>
              <li><strong>Duolync</strong> (also &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) refers to the company operating the Service, registered in Georgia.</li>
              <li><strong>Brand</strong> means any business, agency, organization, or individual who registers as a Brand on Duolync to discover, contact, and collaborate with Creators.</li>
              <li><strong>Creator</strong> means any individual content creator who registers on Duolync to build a portfolio, connect social accounts, and discover brand collaboration opportunities.</li>
              <li><strong>User</strong> means any registered Brand or Creator using the Service.</li>
              <li><strong>Campaign</strong> means a sponsored content or collaboration project created by a Brand on Duolync, including the brief, terms, deliverables, timeline, and compensation.</li>
              <li><strong>Application</strong> means a Creator&apos;s submission of interest to participate in a Brand&apos;s Campaign.</li>
              <li><strong>Deliverable</strong> means a piece of content, post, story, video, or other output a Creator is contracted to produce as part of a Campaign.</li>
              <li><strong>Connected Social Account</strong> means any social media account (Instagram, TikTok, YouTube, etc.) a Creator links to their Duolync profile via OAuth.</li>
              <li><strong>Profile</strong> means a User&apos;s publicly visible page on Duolync, including portfolio media, bio, and social metrics.</li>
              <li><strong>Portfolio</strong> means the collection of past work, connected social account data, and campaign history displayed on a Creator&apos;s Profile.</li>
            </ul>

            {/* 3. Marketplace Rules */}
            <h2 id="marketplace">Marketplace Rules</h2>
            <p>
              Duolync is a two-sided marketplace. Brands use the platform to discover and work with Creators; Creators
              use the platform to find paid collaboration opportunities and build their professional presence. The
              following rules govern all marketplace interactions.
            </p>

            <h3>Good Faith Participation</h3>
            <p>
              All Users must participate in the marketplace in good faith. This means providing accurate information
              about yourself, your brand, your audience, and your capabilities; honoring commitments made to other
              Users; and communicating professionally and honestly at all times.
            </p>

            <h3>No Circumvention</h3>
            <p>
              Users may not use contact information or connections obtained through Duolync to conduct business
              outside of the platform in order to circumvent platform fees, policies, or tracking. Duolync facilitates
              and enables these introductions, and operating through the platform protects both parties.
            </p>

            <h3>No Misrepresentation</h3>
            <p>
              Users must not misrepresent their identity, follower counts, engagement rates, audience demographics,
              industry affiliations, or past work. Duolync may verify data against Connected Social Accounts and
              third-party signals. Accounts found to misrepresent metrics will be subject to immediate suspension.
            </p>

            <h3>Professional Standards</h3>
            <p>
              Duolync is a professional marketplace. All communications between Brands and Creators must remain
              respectful and lawful. Harassment, discrimination, threats, or solicitation of illegal activity are
              strictly prohibited and may result in permanent account termination.
            </p>

            <h3>Prohibited Industries</h3>
            <p>
              Brands in the following industries are prohibited from using Duolync to run campaigns:
            </p>
            <ul>
              <li>Adult content or sexually explicit material</li>
              <li>Weapons, firearms, or ammunition (unless licensed and regionally compliant)</li>
              <li>Tobacco, e-cigarettes, or illicit substances</li>
              <li>Pyramid schemes, multi-level marketing schemes misrepresented as employment</li>
              <li>Gambling or unregulated financial investment schemes</li>
              <li>Content that promotes hatred, discrimination, or violence</li>
            </ul>

            {/* 4. Account Responsibilities */}
            <h2 id="accounts">Account Responsibilities</h2>

            <h3>Account Security</h3>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for all
              activity that occurs under your account. You must:
            </p>
            <ul>
              <li>Use a strong, unique password and update it regularly.</li>
              <li>Enable two-factor authentication if offered by the platform.</li>
              <li>Notify us immediately at <a href="mailto:hello@duolync.com">hello@duolync.com</a> if you suspect unauthorized access to your account.</li>
              <li>Not share your login credentials with any other person.</li>
              <li>Not access another User&apos;s account without authorization.</li>
            </ul>
            <p>
              Duolync is not liable for any loss or damage arising from your failure to maintain account security.
            </p>

            <h3>Accurate Information</h3>
            <p>
              You must ensure that all information in your account profile — including your name, contact details,
              business information, and content metrics — is accurate, current, and complete. You agree to update
              your information promptly if it changes. Providing false information constitutes a material breach of
              these Terms.
            </p>

            <h3>One Account Per User</h3>
            <p>
              Each individual or organization may maintain one active account per account type (Creator or Brand).
              Creating multiple accounts to evade restrictions, bans, or platform rules is prohibited.
            </p>

            <h3>Account Transfers</h3>
            <p>
              Accounts are non-transferable. You may not sell, assign, or transfer your Duolync account to any
              third party without prior written consent from Duolync.
            </p>

            {/* 5. Brand-Specific Terms */}
            <h2 id="brands">Brand-Specific Terms</h2>
            <p>
              In addition to general Terms, the following apply specifically to users registered as Brands:
            </p>
            <ul>
              <li>
                <strong>Truthful Campaigns:</strong> All Campaign briefs, budgets, deliverable expectations, and timelines
                must be accurate and achievable. Misleading campaign descriptions intended to attract Creator applications
                under false pretenses are prohibited.
              </li>
              <li>
                <strong>Timely Communication:</strong> Brands must respond to Creator applications and deliverable
                submissions within the timeframes specified in the Campaign brief or within a reasonable period (not to
                exceed 14 days) where no specific timeline is provided.
              </li>
              <li>
                <strong>Payment Obligations:</strong> Brands are responsible for fulfilling agreed compensation to
                Creators upon delivery and acceptance of Deliverables, in accordance with Campaign terms.
              </li>
              <li>
                <strong>Intellectual Property Respect:</strong> Brands may only use Creator-produced Deliverables as
                agreed in the Campaign terms. Unauthorized redistribution, modification, or commercial exploitation of
                Deliverables beyond agreed scope is prohibited.
              </li>
              <li>
                <strong>Confidentiality:</strong> Brands must treat Creator contact information, pitch materials, and
                rate cards as confidential and may not share them with third parties without Creator consent.
              </li>
            </ul>

            {/* 6. Creator-Specific Terms */}
            <h2 id="creators">Creator-Specific Terms</h2>
            <p>
              In addition to general Terms, the following apply specifically to users registered as Creators:
            </p>
            <ul>
              <li>
                <strong>Accurate Metrics:</strong> You represent that all follower counts, engagement rates, and
                audience demographics displayed on your profile — whether self-reported or sourced via Connected Social
                Accounts — are genuine and not artificially inflated through bots, purchased followers, engagement pods,
                or any other inauthentic means.
              </li>
              <li>
                <strong>Deliverable Quality:</strong> You agree to produce Deliverables that meet the quality and
                specifications outlined in the Campaign brief and any agreed revisions. Consistently substandard
                Deliverables may result in negative reviews, campaign disputes, or account suspension.
              </li>
              <li>
                <strong>Disclosure Requirements:</strong> You are solely responsible for complying with applicable
                advertising disclosure laws (e.g., FTC guidelines, ASA regulations) when publishing sponsored content.
                Sponsored content must be clearly labeled as paid partnerships or advertisements as required by law.
              </li>
              <li>
                <strong>Exclusive Obligations:</strong> Where a Campaign specifies category exclusivity (e.g., no
                competing brand in the same niche for a specified period), you agree to honor those exclusivity terms
                for the duration specified.
              </li>
              <li>
                <strong>Connected Account Accuracy:</strong> You must not connect social accounts that belong to
                another person, or manipulate connected account data in any way that misrepresents your reach or
                engagement.
              </li>
            </ul>

            {/* 7. Campaigns */}
            <h2 id="campaigns">Campaigns &amp; Collaborations</h2>

            <h3>Campaign Formation</h3>
            <p>
              A Campaign is initiated by a Brand and becomes active when Duolync reviews and approves the listing.
              A collaboration agreement between a Brand and Creator is formed when a Creator&apos;s Application is
              accepted by the Brand and both parties confirm the Campaign terms within the platform.
            </p>

            <h3>Deliverables &amp; Revisions</h3>
            <p>
              Creators must submit Deliverables through Duolync&apos;s platform within the agreed timeline. Brands may
              request a reasonable number of revisions (as specified in the Campaign brief). Repeated or bad-faith
              revision requests that exceed Campaign scope may be raised as a dispute.
            </p>

            <h3>Campaign Cancellations</h3>
            <p>
              Either party may request cancellation of a Campaign before the Creator begins work on Deliverables.
              Cancellations after work has commenced may be subject to partial compensation obligations as determined
              by the Campaign terms or Duolync dispute resolution. Duolync reserves the right to cancel any Campaign
              that violates these Terms.
            </p>

            <h3>Reviews &amp; Ratings</h3>
            <p>
              Upon Campaign completion, Brands and Creators may leave reviews and ratings for one another. Reviews
              must be honest, accurate, and based on actual experience. Fake, retaliatory, or incentivized reviews
              are prohibited and may be removed by Duolync without notice.
            </p>

            {/* 8. Content & IP */}
            <h2 id="content-ip">Content &amp; Intellectual Property</h2>

            <h3>Creator Ownership</h3>
            <p>
              Creators retain full ownership of all original content they create, including Deliverables produced for
              Campaigns. Nothing in these Terms transfers copyright or other intellectual property rights in a
              Creator&apos;s content to Duolync or to any Brand, except as expressly agreed in the Campaign terms.
            </p>

            <h3>License to Duolync</h3>
            <p>
              By uploading or displaying content on Duolync (including profile media, portfolio items, and bio),
              you grant Duolync a non-exclusive, royalty-free, worldwide license to host, display, reproduce, and
              distribute that content solely for the purpose of operating and promoting the Service. This includes
              displaying your portfolio on your Creator Profile, in Brand discovery grids, and in Duolync marketing
              materials (e.g., case studies or platform showcase pages).
            </p>
            <p>
              You may revoke this license at any time by removing the content from your profile or deleting your
              account, subject to reasonable technical processing time.
            </p>

            <h3>License to Brands</h3>
            <p>
              The usage rights a Brand receives over a Creator&apos;s Deliverables are governed entirely by the terms
              agreed within the Campaign brief. Unless a Campaign brief explicitly grants broader rights (e.g.,
              buyout, unlimited usage, whitelisting), the Brand receives a limited, non-exclusive license to use
              the Deliverable for the purposes and duration specified in the Campaign.
            </p>

            <h3>Platform Content</h3>
            <p>
              All content owned by Duolync — including the platform&apos;s design, logos, text, software, and brand
              identity — is protected by intellectual property law. You may not copy, modify, distribute, or create
              derivative works from Duolync&apos;s proprietary content without written permission.
            </p>

            <h3>Third-Party Content</h3>
            <p>
              Users must not upload content that infringes the intellectual property rights of any third party,
              including copyrighted music, video footage, trademarks, or brand assets. Duolync will remove
              infringing content and may suspend accounts that repeatedly upload infringing material.
            </p>

            {/* 9. Disputes */}
            <h2 id="disputes">Dispute Resolution &amp; Admin Authority</h2>
            <p>
              Duolync provides a structured process for resolving disputes between Brands and Creators. Our goal
              is to facilitate fair, timely, and impartial resolution of disagreements that arise in the context
              of the marketplace.
            </p>

            <h3>Informal Resolution First</h3>
            <p>
              Before raising a formal dispute, parties are encouraged to attempt resolution directly through
              Duolync&apos;s in-platform messaging. Many disputes can be resolved quickly through open communication.
              A formal dispute should be filed only when direct communication has failed.
            </p>

            <h3>Filing a Formal Dispute</h3>
            <p>
              Either party may raise a formal dispute within <strong>14 days</strong> of the triggering event
              (e.g., missed deliverable deadline, payment failure, policy violation). Disputes are filed through
              the Campaign management interface. Both parties will be notified and given an opportunity to submit
              their evidence and position.
            </p>

            <h3>Duolync Admin Review</h3>
            <p>
              Duolync administrators will review all formal dispute submissions. The review process includes:
            </p>
            <ul>
              <li>Examination of Campaign terms, deliverable submissions, and communication logs</li>
              <li>Review of evidence submitted by both parties (screenshots, files, messages)</li>
              <li>Consideration of platform policies, prior conduct history, and contextual factors</li>
              <li>A written decision delivered to both parties within <strong>10 business days</strong> of the dispute being formally reviewed (complex cases may take longer)</li>
            </ul>

            <h3>Possible Outcomes &amp; Administrative Actions</h3>
            <p>
              Following a dispute review, Duolync administrators may take any of the following actions:
            </p>
            <ul>
              <li>
                <strong>Dismiss the dispute</strong> if it is found to be unfounded or brought in bad faith.
              </li>
              <li>
                <strong>Issue a formal warning</strong> to one or both parties for conduct that violates platform
                policies but does not warrant account suspension.
              </li>
              <li>
                <strong>Mediate an agreed resolution</strong> between the parties, including adjusted payment terms,
                revised deliverable requirements, or mutual release.
              </li>
              <li>
                <strong>Issue a binding decision</strong> on the dispute, including determination of whether a
                Deliverable meets Campaign specifications, or whether compensation is owed.
              </li>
              <li>
                <strong>Restrict account features</strong> (e.g., suspend campaign creation or application ability)
                for a defined period pending resolution.
              </li>
              <li>
                <strong>Suspend the account</strong> of a party found to have materially violated platform policies,
                with temporary or indefinite suspension as appropriate to the severity of the violation.
              </li>
              <li>
                <strong>Permanently ban an account</strong> for severe violations including fraud, harassment,
                repeated policy breaches, or legal violations.
              </li>
            </ul>

            <h3>Admin Decisions Are Final</h3>
            <p>
              Duolync&apos;s administrative decisions on disputes are final within the platform. By using the Service,
              you consent to Duolync&apos;s dispute resolution process and agree not to circumvent platform decisions
              through external claims solely based on a Duolync dispute outcome, except where required by applicable
              law.
            </p>

            <h3>Appeals</h3>
            <p>
              A party that believes an administrative decision was made in error may submit a written appeal within
              7 days of receiving the decision by emailing <a href="mailto:hello@duolync.com">hello@duolync.com</a>{" "}
              with the subject line &ldquo;Dispute Appeal — [Campaign ID].&rdquo; Appeals must include new evidence or
              demonstrate a procedural error. Duolync will review appeals within 14 business days. Appeal decisions
              are final.
            </p>

            {/* 10. Prohibited Conduct */}
            <h2 id="prohibited">Prohibited Conduct</h2>
            <p>
              The following behaviors are strictly prohibited on Duolync and may result in immediate account
              suspension or permanent termination:
            </p>
            <ul>
              <li>Providing false or misleading information in your profile, campaign, or any platform interaction</li>
              <li>Artificially inflating social metrics (e.g., purchasing followers, using bots, or coordinating engagement pods to misrepresent reach)</li>
              <li>Harassment, bullying, threats, or abusive communications toward any User or Duolync staff</li>
              <li>Attempting to circumvent platform fees by taking relationships off-platform to avoid using Duolync</li>
              <li>Creating multiple accounts to evade bans, warnings, or restrictions</li>
              <li>Uploading or distributing malware, phishing content, or malicious code</li>
              <li>Accessing other Users&apos; accounts without authorization</li>
              <li>Attempting to reverse-engineer, scrape, or systematically extract platform data</li>
              <li>Publishing or transmitting spam, unsolicited messages, or chain communications</li>
              <li>Facilitating or promoting illegal activity through the platform</li>
              <li>Violating any applicable laws or regulations in connection with your use of the Service</li>
            </ul>

            {/* 11. Termination */}
            <h2 id="termination">Termination &amp; Suspension</h2>

            <h3>Termination by You</h3>
            <p>
              You may close your account at any time from <strong>Settings → Account → Delete Account</strong>.
              Upon account deletion, your profile will be removed from public discovery. Any active Campaign
              obligations should be resolved or formally closed before account deletion. Duolync is not
              responsible for incomplete Campaign obligations resulting from voluntary account deletion.
            </p>

            <h3>Termination by Duolync</h3>
            <p>
              Duolync may suspend or permanently terminate your account at any time, with or without notice, for
              any of the following reasons:
            </p>
            <ul>
              <li>Material breach of these Terms</li>
              <li>Repeated or severe violations of platform policies</li>
              <li>Fraudulent, abusive, or illegal conduct</li>
              <li>Dispute decisions that result in account suspension or ban</li>
              <li>Inactivity exceeding 24 months (with prior notice)</li>
              <li>Legal obligation or court order</li>
            </ul>

            <h3>Effect of Termination</h3>
            <p>
              Upon termination, your right to access and use the Service will cease immediately. Provisions of
              these Terms that by their nature should survive termination (including intellectual property,
              dispute resolution, limitation of liability, and governing law) will continue to apply.
            </p>

            {/* 12. Liability */}
            <h2 id="liability">Limitation of Liability</h2>
            <p>
              The Service is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis. Duolync makes no warranties,
              express or implied, regarding the reliability, accuracy, or fitness of the Service for any
              particular purpose.
            </p>
            <p>
              To the maximum extent permitted by applicable law, Duolync shall not be liable for any indirect,
              incidental, special, consequential, or punitive damages — including loss of profits, revenue, data,
              goodwill, or business opportunities — arising from your use of or inability to use the Service,
              even if Duolync has been advised of the possibility of such damages.
            </p>
            <p>
              Duolync&apos;s total liability to any User for any claim arising from or related to the Service shall not
              exceed the greater of (a) the total fees paid by that User to Duolync in the 12 months preceding the
              claim, or (b) USD $100.
            </p>
            <p>
              Duolync is not a party to agreements between Brands and Creators and is not responsible for the
              conduct, quality of work, or payment obligations of any User.
            </p>

            {/* 13. Governing Law */}
            <h2 id="governing-law">Governing Law</h2>
            <p>
              These Terms and any dispute arising from them shall be governed by and construed in accordance with
              the laws of Georgia, without regard to its conflict of law principles. Users in the European Union
              retain any mandatory consumer protections afforded by the law of their country of residence.
            </p>
            <p>
              Any dispute not resolved through Duolync&apos;s internal process that requires legal proceedings shall
              be subject to the exclusive jurisdiction of the courts of Georgia, unless prohibited by applicable law.
            </p>

            {/* 14. Changes */}
            <h2 id="changes">Changes to Terms</h2>
            <p>
              Duolync reserves the right to modify these Terms at any time. When we make material changes, we will
              provide at least 14 days&apos; advance notice by updating the &ldquo;Last updated&rdquo; date on this page and
              sending a notification to your registered email address.
            </p>
            <p>
              Your continued use of the Service after the effective date of updated Terms constitutes acceptance of
              those changes. If you disagree with updated Terms, you must stop using the Service and may close
              your account before the effective date.
            </p>

            {/* 15. Contact */}
            <h2 id="contact">Contact Us</h2>
            <p>
              If you have any questions about these Terms of Service, please reach out:
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
              We will respond to all Terms-related inquiries within 30 days.
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
