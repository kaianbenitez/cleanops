export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <p className="eyebrow">Legal</p>
        <h1 className="page-title mt-2">Privacy Policy</h1>
        <p className="page-subtitle">How ServiceSpark, provided by Simply Maid LLC, collects, uses, and protects information.</p>
      </div>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">Overview</h2>
        <p>
          ServiceSpark is the internal operations platform Simply Maid LLC&apos;s admins and field staff use to manage customers, jobs, scheduling, payroll, and invoicing. This policy explains what information ServiceSpark collects, how it&apos;s used, and how it&apos;s protected. It applies to your ServiceSpark account and the information stored in it — it is separate from the privacy policy on our public website.
        </p>
      </section>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">Information We Collect</h2>
        <div className="space-y-3">
          <p><strong className="text-[var(--co-ink)]">Customer information:</strong> name, address, phone number, email, service notes and preferences, home access details such as gate, garage, or alarm codes, before/after job photos, and invoice and payment records.</p>
          <p><strong className="text-[var(--co-ink)]">Staff information:</strong> name, contact information, profile photo, birthday, pay rate and payroll history, hours worked, time-clock records, and paid time off.</p>
          <p><strong className="text-[var(--co-ink)]">Account information:</strong> your username, encrypted password, and login activity.</p>
          <p><strong className="text-[var(--co-ink)]">Communications data:</strong> information synced with our GoHighLevel CRM to support scheduling and customer communication.</p>
        </div>
      </section>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">How Information Is Collected</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Entered directly by staff and admins when creating customer, job, or employee records.</li>
          <li>Submitted by customers through quote and proposal links we send them.</li>
          <li>Synced automatically from GoHighLevel when a contact is linked to a customer.</li>
          <li>Captured automatically for operational records, such as clock-in/out times, job status, and system error monitoring.</li>
        </ul>
      </section>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">How We Use Information</h2>
        <p>To schedule and complete cleaning jobs, manage staff assignments and payroll, generate invoices and process payments, communicate with customers about appointments, and maintain and improve ServiceSpark.</p>
      </section>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">Who We Share Information With</h2>
        <p>We do not sell or rent this information. We share it only with the service providers that help us operate ServiceSpark, each of whom is only permitted to use it to provide their service to us:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Supabase — database hosting, account authentication, and photo storage.</li>
          <li>Vercel — application hosting.</li>
          <li>Square — invoicing and payment processing.</li>
          <li>Google — address lookup and mapping.</li>
          <li>Sentry — error monitoring, to help us detect and fix problems.</li>
          <li>GoHighLevel — customer relationship and communication management.</li>
        </ul>
        <p>We may also disclose information if required by law, or to protect the rights, property, or safety of Simply Maid LLC, our staff, or our customers.</p>
      </section>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">Data Security</h2>
        <p>ServiceSpark requires a company account and password to sign in, and each account can only access information for its own company. Connections to ServiceSpark are encrypted, and we control database-level access to every record. No method of transmission or storage is completely secure, and we can&apos;t guarantee absolute security, but we work to protect your information appropriately — including a database access review completed in August 2026 that tightened record-level access controls.</p>
      </section>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">Data Retention</h2>
        <p>We retain information for as long as your company&apos;s ServiceSpark account is active, and afterward only as long as needed to meet legal, tax, payroll, or accounting obligations, resolve disputes, or enforce our agreements.</p>
      </section>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">Your Choices and Rights</h2>
        <p>Staff can review and update their own account information at any time from their account settings. To request a copy, correction, or deletion of information, contact your company administrator. We will fulfill reasonable requests, other than information we&apos;re required to keep for legal, accounting, tax, or dispute-resolution purposes.</p>
      </section>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">Children</h2>
        <p>ServiceSpark is a business tool for company staff and is not directed at or intended for use by children.</p>
      </section>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">Changes to This Policy</h2>
        <p>We may update this policy as ServiceSpark changes. We&apos;ll let company administrators know about material changes.</p>
      </section>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">Contact</h2>
        <p>Questions about this policy or how your information is handled should go to your company administrator.</p>
      </section>
    </div>
  );
}
