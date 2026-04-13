'use client'

import { useRouter } from 'next/navigation'

export default function PrivacyPage() {
  const router = useRouter()
  const lastUpdated = 'April 2026'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: '#fafaf8',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        backgroundColor: '#fff',
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            padding: '8px 14px',
            fontSize: '14px',
            fontWeight: '600',
            color: '#2d6a4f',
            backgroundColor: '#f0f7f4',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          ← Back
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>Privacy Policy</h1>
        <div style={{ width: '60px' }} />
      </div>

      <div style={{ padding: '24px 20px', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
        <p style={{ fontSize: '13px', color: '#999', marginBottom: '32px' }}>Last updated: {lastUpdated}</p>

        {[
          {
            title: '1. What We Collect',
            body: 'Pantri collects your email address, pantry inventory, chat messages, receipt photos, meal plans, grocery lists, and spending records. Receipt photos are processed by AI and not stored permanently beyond the parsed data.'
          },
          {
            title: '2. How We Use Your Data',
            body: 'Your data is used solely to provide the Pantri service — tracking your pantry, generating meal suggestions, and producing grocery lists. We do not sell your data to third parties. We do not use your data for advertising.'
          },
          {
            title: '3. AI Processing',
            body: 'Pantri uses Anthropic\'s Claude AI to parse receipts, answer questions, and generate suggestions. Your pantry contents and chat messages are sent to Anthropic\'s API to generate responses. Anthropic\'s privacy policy applies to this processing. We do not use your data to train AI models.'
          },
          {
            title: '4. Data Storage',
            body: 'Your data is stored securely in Supabase, a PostgreSQL database provider. Data is encrypted at rest and in transit. Receipt photos are stored in Supabase Storage with access controls.'
          },
          {
            title: '5. Household Sharing',
            body: 'When you share a household with other users, your pantry, recipes, meal plans, and grocery lists are visible to all household members. Spending records and chat history remain private to each individual user.'
          },
          {
            title: '6. Data Retention',
            body: 'Your data is retained as long as your account is active. You can request deletion of your account and all associated data by contacting us. Household data is retained until all members leave the household.'
          },
          {
            title: '7. Your Rights',
            body: 'You have the right to access, correct, or delete your personal data at any time. You can export your pantry data from within the app. For data deletion requests, contact us directly.'
          },
          {
            title: '8. Children\'s Privacy',
            body: 'Pantri is not intended for children under 13. We do not knowingly collect data from children under 13.'
          },
          {
            title: '9. Changes to This Policy',
            body: 'We may update this privacy policy from time to time. We will notify users of significant changes via the app or email.'
          },
          {
            title: '10. Contact',
            body: 'For privacy questions or data requests, please contact us through the app or at the email address associated with your account.'
          },
        ].map((section, i) => (
          <div key={i} style={{ marginBottom: '28px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', margin: '0 0 8px 0' }}>{section.title}</h2>
            <p style={{ fontSize: '15px', color: '#444', lineHeight: '1.6', margin: 0 }}>{section.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
