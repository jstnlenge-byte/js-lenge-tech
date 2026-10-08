require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { supabase } = require("./supabase");

const databasePath = path.join(__dirname, "data", "database.json");

async function migrate() {
  console.log("==========================================");
  console.log("   MIGRATION JS LENGE TECH SERVICES");
  console.log("==========================================");

  if (!fs.existsSync(databasePath)) {
    console.error("❌ Fichier database.json introuvable.");
    process.exit(1);
  }

  const database = JSON.parse(fs.readFileSync(databasePath, "utf8"));

  console.log("✅ Ancienne base trouvée.");

  /*
   * 1. MEMBRES
   */
  const members = Array.isArray(database.members)
    ? database.members
    : [];

  console.log(`\n👥 Membres trouvés : ${members.length}`);

  for (const member of members) {
    const data = {
      name: member.name || "Membre",
      email: member.email,
      password_hash: member.password_hash || "",
      country: member.country || "",
      skills: member.skills || "",
      bio: member.bio || "",
      ideas: member.ideas || "",
      links: member.links || "",
      photo: member.photo || "",
      role: member.role || "member",
      status: member.status || "active",
      created_at: member.created_at || new Date().toISOString()
    };

    if (!data.email) {
      console.log("⚠️ Membre ignoré : email manquant.");
      continue;
    }

    const { data: existing, error: findError } = await supabase
      .from("members")
      .select("id,email")
      .eq("email", data.email)
      .maybeSingle();

    if (findError) {
      console.error(
        `❌ Erreur recherche membre ${data.email}:`,
        findError.message
      );
      continue;
    }

    if (existing) {
      console.log(`ℹ️ Déjà présent : ${data.email}`);
      continue;
    }

    const { error } = await supabase
      .from("members")
      .insert(data);

    if (error) {
      console.error(
        `❌ Erreur insertion ${data.email}:`,
        error.message
      );
    } else {
      console.log(`✅ Membre migré : ${data.email}`);
    }
  }

  /*
   * Fonction pour retrouver le nouvel ID Supabase
   * à partir de l'ancien ID ou de l'email.
   */
  async function getNewMemberId(oldMemberId) {
    if (!oldMemberId) return null;

    const oldMember = members.find(
      (member) => String(member.id) === String(oldMemberId)
    );

    if (!oldMember || !oldMember.email) return null;

    const { data, error } = await supabase
      .from("members")
      .select("id")
      .eq("email", oldMember.email)
      .maybeSingle();

    if (error || !data) return null;

    return data.id;
  }

  /*
   * 2. IDÉES
   */
  const ideas = Array.isArray(database.ideas)
    ? database.ideas
    : [];

  console.log(`\n💡 Idées trouvées : ${ideas.length}`);

  for (const idea of ideas) {
    const memberId = await getNewMemberId(
      idea.member_id || idea.memberId
    );

    if (!memberId) {
      console.log(`⚠️ Idée ignorée : membre introuvable.`);
      continue;
    }

    const data = {
      member_id: memberId,
      member_name: idea.member_name || idea.memberName || "",
      title: idea.title || "Sans titre",
      description: idea.description || "",
      created_at: idea.created_at || new Date().toISOString()
    };

    const { error } = await supabase
      .from("ideas")
      .insert(data);

    if (error) {
      console.error("❌ Erreur idée :", error.message);
    } else {
      console.log(`✅ Idée migrée : ${data.title}`);
    }
  }

  /*
   * 3. PROJETS
   */
  const projects = Array.isArray(database.projects)
    ? database.projects
    : [];

  console.log(`\n🚀 Projets trouvés : ${projects.length}`);

  for (const project of projects) {
    const memberId = await getNewMemberId(
      project.member_id || project.memberId
    );

    if (!memberId) {
      console.log(`⚠️ Projet ignoré : membre introuvable.`);
      continue;
    }

    const data = {
      member_id: memberId,
      member_name:
        project.member_name ||
        project.memberName ||
        "",
      title: project.title || "Sans titre",
      description: project.description || "",
      status: project.status || "proposé",
      created_at:
        project.created_at ||
        new Date().toISOString()
    };

    const { error } = await supabase
      .from("projects")
      .insert(data);

    if (error) {
      console.error("❌ Erreur projet :", error.message);
    } else {
      console.log(`✅ Projet migré : ${data.title}`);
    }
  }

  /*
   * 4. PUBLICATIONS
   */
  const publications = Array.isArray(database.publications)
    ? database.publications
    : [];

  console.log(
    `\n📰 Publications trouvées : ${publications.length}`
  );

  for (const publication of publications) {
    const memberId = await getNewMemberId(
      publication.member_id ||
      publication.memberId
    );

    if (!memberId) {
      console.log(`⚠️ Publication ignorée : membre introuvable.`);
      continue;
    }

    const data = {
      member_id: memberId,
      member_name:
        publication.member_name ||
        publication.memberName ||
        "",
      title: publication.title || "",
      content: publication.content || "",
      created_at:
        publication.created_at ||
        new Date().toISOString()
    };

    const { error } = await supabase
      .from("publications")
      .insert(data);

    if (error) {
      console.error(
        "❌ Erreur publication :",
        error.message
      );
    } else {
      console.log(`✅ Publication migrée.`);
    }
  }

  /*
   * 5. MESSAGES
   */
  const messages = Array.isArray(database.messages)
    ? database.messages
    : [];

  console.log(`\n💬 Messages trouvés : ${messages.length}`);

  for (const message of messages) {
    const senderId = await getNewMemberId(
      message.sender_id ||
      message.senderId
    );

    const receiverId = await getNewMemberId(
      message.receiver_id ||
      message.receiverId
    );

    if (!senderId || !receiverId) {
      console.log(`⚠️ Message ignoré : membre introuvable.`);
      continue;
    }

    const data = {
      sender_id: senderId,
      sender_name:
        message.sender_name ||
        message.senderName ||
        "",
      receiver_id: receiverId,
      content: message.content || "",
      created_at:
        message.created_at ||
        new Date().toISOString()
    };

    const { error } = await supabase
      .from("messages")
      .insert(data);

    if (error) {
      console.error(
        "❌ Erreur message :",
        error.message
      );
    } else {
      console.log(`✅ Message migré.`);
    }
  }

  /*
   * 6. NOTIFICATIONS
   */
  const notifications = Array.isArray(database.notifications)
    ? database.notifications
    : [];

  console.log(
    `\n🔔 Notifications trouvées : ${notifications.length}`
  );

  for (const notification of notifications) {
    const memberId = await getNewMemberId(
      notification.member_id ||
      notification.memberId
    );

    if (!memberId) {
      console.log(
        `⚠️ Notification ignorée : membre introuvable.`
      );
      continue;
    }

    const data = {
      member_id: memberId,
      title: notification.title || "",
      message: notification.message || "",
      read: Boolean(notification.read),
      created_at:
        notification.created_at ||
        new Date().toISOString()
    };

    const { error } = await supabase
      .from("notifications")
      .insert(data);

    if (error) {
      console.error(
        "❌ Erreur notification :",
        error.message
      );
    } else {
      console.log(`✅ Notification migrée.`);
    }
  }

  /*
   * 7. LIENS
   */
  const links = Array.isArray(database.links)
    ? database.links
    : [];

  console.log(`\n🔗 Liens trouvés : ${links.length}`);

  for (const link of links) {
    const memberId = await getNewMemberId(
      link.member_id ||
      link.memberId
    );

    if (!memberId) {
      console.log(`⚠️ Lien ignoré : membre introuvable.`);
      continue;
    }

    if (!link.title || !link.url) {
      console.log(`⚠️ Lien ignoré : titre ou URL manquant.`);
      continue;
    }

    const data = {
      member_id: memberId,
      member_name:
        link.member_name ||
        link.memberName ||
        "",
      title: link.title,
      url: link.url,
      status: link.status || "pending",
      created_at:
        link.created_at ||
        new Date().toISOString()
    };

    const { error } = await supabase
      .from("links")
      .insert(data);

    if (error) {
      console.error(
        "❌ Erreur lien :",
        error.message
      );
    } else {
      console.log(`✅ Lien migré : ${data.title}`);
    }
  }

  console.log("\n==========================================");
  console.log("   ✅ MIGRATION TERMINÉE");
  console.log("==========================================");
  console.log("Les données originales sont toujours");
  console.log("présentes dans data/database.json.");
}

migrate().catch((error) => {
  console.error("\n❌ ERREUR DE MIGRATION :", error);
  process.exit(1);
});
