require("dotenv").config();

const bcrypt = require("bcryptjs");
const { supabase } = require("./supabase");

async function resetPassword() {
  const email = "jstnlenge@gmail.com";
  const newPassword = "justin2025";

  const passwordHash = await bcrypt.hash(newPassword, 10);

  const { data, error } = await supabase
    .from("members")
    .update({ password_hash: passwordHash })
    .eq("email", email)
    .select("id,email,role");

  if (error) {
    console.error("❌ Erreur :", error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log("❌ Compte introuvable.");
    process.exit(1);
  }

  console.log("✅ Mot de passe réinitialisé.");
  console.log("Email :", data[0].email);
  console.log("Rôle :", data[0].role);
}

resetPassword();
