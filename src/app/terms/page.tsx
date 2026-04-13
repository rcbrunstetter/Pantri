'use client'

import { useRouter } from 'next/navigation'

export default function TermsPage() {
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
        <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>Terms of Service</h1>
        <div style={{ width: '60px' }} />
      </div>

      <div style={{ padding: '24px 20px', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
        <p style={{ fontSize: '13px', color: '#999', marginBottom: '32px' }}>Last updated: {lastUpdated}</p>

        {[
          {
            title: '1. Acceptance of Terms',
            body: 'By using Pantri, you agree to these Terms of Service. If you do not agree, please do not use the app.'
          },
          {
            title: '2. Description of Service',
            body: 'Pantri is a household kitchen and grocery management application that uses AI to track pantry inventory, suggest meals, and generate grocery lists. The service is provided as-is.'
          },
          {
            title: '3. User Accounts',
            body: 'You are responsible for maintaining the security of your account credentials. You are responsible for all activity that occurs under your account. You must provide accurate information when creating your account.'
          },
          {
            title: '4. Household Sharing',
            body: 'When you invite others to your household, you are responsible for ensuring they agree to these terms. You can remove household members at any time. Removing a member does not delete their personal account.'
          },
          {
            title: '5. Acceptable Use',
            body: 'You agree not to misuse the service, attempt to access other users\' data, use the service for commercial purposes without permission, or use the service to violate any laws.'
          },
          {
            title: '6. AI-Generated Content',
            body: 'Pantri uses AI to generate meal suggestions, grocery lists, and recipe ideas. This content is for informational purposes only. Always use your own judgment regarding food safety, allergies, and dietary needs. We are not responsible for AI-generated suggestions.'
          },
          {
            title: '7. Food Safety',
            body: 'Pantri tracks pantry items but cannot guarantee food safety or freshness. Always use your own judgment when determining if food is safe to consume. We are not liable for any illness or injury resulting from food consumption.'
          },
          {
            title: '8. Service Availability',
            body: 'We strive to maintain service availability but do not guarantee uninterrupted access. We may modify, suspend, or discontinue the service at any time with reasonable notice.'
          },
          {
            title: '9. Limitation of Liability',
            body: 'Pantri is provided as-is without warranties of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the service.'
          },
          {
            title: '10. Changes to Terms',
            body: 'We may update these terms from time to time. Continued use of the service after changes constitutes acceptance of the new terms. We will notify users of significant changes.'
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
