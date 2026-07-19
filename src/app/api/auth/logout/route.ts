import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 forces the browser to follow the redirect with GET — the default
  // 307 preserves the original POST, and /login (a page route) only
  // accepts GET, which is exactly the 405 this was causing.
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
