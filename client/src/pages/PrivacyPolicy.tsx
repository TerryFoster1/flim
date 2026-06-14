import { PageShell } from "../components/PageShell";

export function PrivacyPolicy() {
  return (
    <PageShell eyebrow="Privacy" title="Privacy Policy" description="Last Updated: June 2026">
      <div className="legal-page">
        <section>
          <p>
            Welcome to Flim. Flim is a movie and TV discovery platform focused on playlists, tracking, recommendations,
            trivia, challenges, and entertainment discovery. We respect your privacy and want you to understand what
            information we collect and how it is used.
          </p>
        </section>

        <section>
          <h2>Information We Collect</h2>
          <h3>Account Information</h3>
          <p>When you create an account, we may collect name or username, email address, profile information you choose to provide, avatar selections, region and streaming service preferences, and notification preferences.</p>
          <h3>Usage Information</h3>
          <p>To operate and improve Flim, we may collect information about playlists you create, follow, save, or share; movies and shows you search for, view, track, or add to playlists; trivia, challenge, and arcade activity; release tracking activity; provider and affiliate link clicks; and app interactions, errors, and performance data.</p>
          <h3>Device and Technical Information</h3>
          <p>We may collect limited technical information such as device type, browser type, operating system, language and region settings, app install or PWA status, and anonymous analytics and diagnostic information.</p>
          <h3>Notifications</h3>
          <p>If you enable notifications, we may store your notification preferences and device subscription information needed to deliver alerts.</p>
        </section>

        <section>
          <h2>How We Use Information</h2>
          <p>We use information to provide and improve Flim, save playlists and preferences, personalize discovery and recommendations, show streaming availability based on your region and selected services, track releases and availability changes, deliver notifications you request, improve trivia and arcade features, measure app performance, and prevent abuse or unauthorized activity.</p>
        </section>

        <section>
          <h2>Public Content</h2>
          <p>Some content may be public if you choose to make it public, including public profiles, public playlists, shared playlist links, shared trivia or challenge results, and public curator activity. Private playlists and private account settings are not intended to be public.</p>
        </section>

        <section>
          <h2>Affiliate Links and Sponsored Content</h2>
          <p>Flim may include affiliate links, ticket links, rental or purchase links, streaming links, merchandise links, sponsored placements, or partner offers. If you click one of these links, Flim may receive a commission or benefit at no additional cost to you. We may track affiliate and sponsored link clicks for reporting, analytics, and partner attribution. Sponsored or promotional content should be identified where required.</p>
        </section>

        <section>
          <h2>Third-Party Services</h2>
          <p>Flim may use third-party services to provide app functionality, including authentication services, hosting and database providers, analytics and performance tools, movie and TV metadata providers, streaming availability providers, notification delivery services, and affiliate or partner link providers. These services may process information as needed to provide their functionality.</p>
        </section>

        <section>
          <h2>Cookies and Local Storage</h2>
          <p>Flim may use cookies, local storage, and similar technologies to keep you signed in, remember preferences, store app settings, improve performance, support analytics, and manage install prompts and dismissed messages.</p>
        </section>

        <section>
          <h2>Data Security</h2>
          <p>We use reasonable safeguards to protect user information from unauthorized access, misuse, loss, or disclosure. No online service can guarantee absolute security, but protecting user information is important to us.</p>
        </section>

        <section>
          <h2>Data Retention</h2>
          <p>We keep information for as long as reasonably necessary to provide Flim, improve the service, comply with legal obligations, resolve disputes, and enforce our terms.</p>
        </section>

        <section>
          <h2>Your Choices</h2>
          <p>You may be able to update your profile, change notification settings, change region and streaming preferences, delete playlists or content you created, make playlists public or private, and request account deletion.</p>
        </section>

        <section>
          <h2>Children's Privacy</h2>
          <p>Flim is not intended for children under 13. We do not knowingly collect personal information from children under 13.</p>
        </section>

        <section>
          <h2>Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. If we make significant changes, we will update the date above and may provide additional notice in the app.</p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>If you have questions about this Privacy Policy or your information, contact us through the support options available in Flim.</p>
        </section>
      </div>
    </PageShell>
  );
}
