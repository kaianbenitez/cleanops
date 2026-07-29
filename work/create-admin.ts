import postgres from "postgres";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { generateTemporaryPassword, slugifyUsername, usernameToEmail } from "../src/lib/auth/username";

dotenv.config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

// Set these to the real owner's name before running this against production.
const FIRST_NAME = "Jordan";
const LAST_NAME = "Owner";

async function main() {
  const [company] = await sql`select id from companies limit 1`;
  if (!company) throw new Error("No company found — run the config import first");

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const username = slugifyUsername(FIRST_NAME, LAST_NAME);
  const email = usernameToEmail(username);
  const temporaryPassword = generateTemporaryPassword();

  const { data: authUser, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  });
  if (error || !authUser.user) throw new Error(error?.message ?? "Failed to create auth user");

  await sql`
    insert into users (id, company_id, role, first_name, last_name, email, is_active, must_change_password)
    values (${authUser.user.id}, ${company.id}, 'admin', ${FIRST_NAME}, ${LAST_NAME}, ${email}, true, true)
  `;

  console.log("Admin created:", { username, password: temporaryPassword });
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
