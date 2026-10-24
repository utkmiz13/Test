/*
  Copy this file to js/config.js and add your Supabase project details.
  The publishable/anon key is intended for browser use when Row Level Security is enabled.
  NEVER put a service_role or secret key in this file.
*/
window.BHOJ_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabasePublishableKey: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY"
};

if (
  window.supabase &&
  window.BHOJ_CONFIG.supabaseUrl.startsWith("https://") &&
  !window.BHOJ_CONFIG.supabaseUrl.includes("YOUR_PROJECT_REF") &&
  window.BHOJ_CONFIG.supabasePublishableKey &&
  !window.BHOJ_CONFIG.supabasePublishableKey.includes("YOUR_SUPABASE")
) {
  window.bhojSupabase = window.supabase.createClient(
    window.BHOJ_CONFIG.supabaseUrl,
    window.BHOJ_CONFIG.supabasePublishableKey
  );
}
