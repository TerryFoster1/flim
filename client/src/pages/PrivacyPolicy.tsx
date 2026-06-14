import { PageShell } from "../components/PageShell";

export function PrivacyPolicy() {
  return (
    <PageShell eyebrow="Privacy" title="Privacy Policy" description="Last Updated: June 2026">
      <div className="legal-page">
        <section>
          <p>Welcome to Flim.</p>
          <p>
            Flim is a movie and TV discovery platform focused on playlists, tracking, recommendations, trivia,
            challenges, and entertainment discovery. We respect your privacy and want you to understand what
            information we collect and how it is used.
          </p>
        </section>

        <section>
          <h2>Information We Collect</h2>
          <h3>Account Information</h3>
          <p>When you create an account, we may collect:</p>
          <ul>
            <li>Name or username</li>
            <li>Email address</li>
            <li>Profile information you choose to provide</li>
            <li>Avatar selections</li>
            <li>Region and streaming service preferences</li>
            <li>Notification preferences</li>
          </ul>

          <h3>Usage Information</h3>
          <p>To operate and improve Flim, we may collect information about how you use the app, including:</p>
          <ul>
            <li>Playlists you create, follow, save, or share</li>
            <li>Movies and shows you search for, view, track, or add to playlists</li>
            <li>Trivia, challenge, and arcade activity</li>
            <li>Release tracking activity</li>
            <li>Provider and affiliate link clicks</li>
            <li>App interactions, errors, and performance data</li>
          </ul>

          <h3>Device and Technical Information</h3>
          <p>We may collect limited technical information such as:</p>
          <ul>
            <li>Device type</li>
            <li>Browser type</li>
            <li>Operating system</li>
            <li>Language and region settings</li>
            <li>App install or PWA status</li>
            <li>Anonymous analytics and diagnostic information</li>
          </ul>

          <h3>Notifications</h3>
          <p>If you enable notifications, we may store your notification preferences and device subscription information needed to deliver alerts.</p>
        </section>

        <section>
          <h2>How We Use Information</h2>
          <p>We use information to:</p>
          <ul>
            <li>Provide and improve Flim</li>
            <li>Save playlists, preferences, and profile settings</li>
            <li>Personalize discovery and recommendations</li>
            <li>Show streaming availability based on your region and selected services</li>
            <li>Track releases, trailers, and availability changes</li>
            <li>Deliver notifications you request</li>
            <li>Improve trivia, challenges, and arcade features</li>
            <li>Measure app performance and reliability</li>
            <li>Prevent abuse, fraud, or unauthorized activity</li>
          </ul>
        </section>

        <section>
          <h2>Public Content</h2>
          <p>Some content may be public if you choose to make it public, including:</p>
          <ul>
            <li>Public profiles</li>
            <li>Public playlists</li>
            <li>Shared playlist links</li>
            <li>Shared trivia or challenge results</li>
            <li>Public curator activity</li>
          </ul>
          <p>Private playlists and private account settings are not intended to be public.</p>
        </section>

        <section>
          <h2>Affiliate Links and Sponsored Content</h2>
          <p>
            Flim may include affiliate links, ticket links, rental or purchase links, streaming links, merchandise
            links, sponsored placements, or partner offers.
          </p>
          <p>If you click one of these links, Flim may receive a commission or benefit at no additional cost to you.</p>
          <p>We may track affiliate and sponsored link clicks for reporting, analytics, and partner attribution.</p>
          <p>Sponsored or promotional content should be identified where required.</p>
        </section>

        <section>
          <h2>Third-Party Services</h2>
          <p>Flim may use third-party services to provide app functionality, including:</p>
          <ul>
            <li>Authentication services</li>
            <li>Hosting and database providers</li>
            <li>Analytics and performance tools</li>
            <li>Movie and TV metadata providers</li>
            <li>Streaming availability providers</li>
            <li>Notification delivery services</li>
            <li>Affiliate and partner link providers</li>
          </ul>
          <p>These services may process information as needed to provide their functionality.</p>
        </section>

        <section>
          <h2>Cookies and Local Storage</h2>
          <p>Flim may use cookies, local storage, and similar technologies to:</p>
          <ul>
            <li>Keep you signed in</li>
            <li>Remember preferences</li>
            <li>Store app settings</li>
            <li>Improve performance</li>
            <li>Support analytics</li>
            <li>Manage install prompts and dismissed messages</li>
          </ul>
        </section>

        <section>
          <h2>Data Security</h2>
          <p>We use reasonable safeguards to protect user information from unauthorized access, misuse, loss, or disclosure.</p>
          <p>No online service can guarantee absolute security, but protecting user information is important to us.</p>
        </section>

        <section>
          <h2>Data Retention</h2>
          <p>
            We keep information for as long as reasonably necessary to provide Flim, improve the service, comply with
            legal obligations, resolve disputes, and enforce our terms.
          </p>
        </section>

        <section>
          <h2>Your Choices</h2>
          <p>You may be able to:</p>
          <ul>
            <li>Update your profile</li>
            <li>Change notification settings</li>
            <li>Change region and streaming preferences</li>
            <li>Delete playlists or content you created</li>
            <li>Make playlists public or private</li>
            <li>Request account deletion</li>
          </ul>
        </section>

        <section>
          <h2>Children's Privacy</h2>
          <p>Flim is not intended for children under 13. We do not knowingly collect personal information from children under 13.</p>
        </section>

        <section>
          <h2>Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. If we make significant changes, we will update the
            date above and may provide additional notice in the app.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>If you have questions about this Privacy Policy or your information, contact us through the support options available in Flim.</p>
        </section>
      </div>
    </PageShell>
  );
}
