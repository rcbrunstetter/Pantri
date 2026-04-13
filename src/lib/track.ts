const ADMIN_USER_ID = 'a88ed39d-c211-404c-a01f-ed7dea38e7d7' // your user ID

export async function track(event: string, userId: string | null, householdId: string | null, properties: Record<string, any> = {}) {
  try {
    await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, userId, householdId, properties }),
    })
  } catch (e) {
    // Tracking is non-critical, fail silently
  }
}
