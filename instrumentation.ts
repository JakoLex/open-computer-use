export async function register() {
  // Only run on server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Status check and machine cleanup disabled (stripped from frontend)
  }
}
