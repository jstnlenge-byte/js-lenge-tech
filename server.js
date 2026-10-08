require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");

const { supabase } = require("./supabase");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   UPLOAD PHOTO - MÉMOIRE
========================================================= */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Format d'image non autorisé."));
    }
  }
});

/* =========================================================
   SESSIONS
========================================================= */

const sessions = new Map();

function createSession(member) {
  const token = crypto.randomBytes(32).toString("hex");

  sessions.set(token, {
    memberId: member.id,
    createdAt: Date.now()
  });

  return token;
}

async function getAuthenticatedMember(req) {
  const auth = req.headers.authorization || "";

  if (!auth.startsWith("Bearer ")) {
    return null;
  }

  const token = auth.slice(7).trim();

  if (!token) {
    return null;
  }

  const session = sessions.get(token);

  if (!session) {
    return null;
  }

  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("id", session.memberId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

async function requireAuth(req, res, next) {
  try {
    const member = await getAuthenticatedMember(req);

    if (!member) {
      return res.status(401).json({
        success: false,
        message: "Connexion requise."
      });
    }

    if (member.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Compte suspendu."
      });
    }

    req.member = member;
    next();
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Erreur d'authentification."
    });
  }
}

async function requireAdmin(req, res, next) {
  try {
    const member = await getAuthenticatedMember(req);

    if (!member) {
      return res.status(401).json({
        success: false,
        message: "Connexion administrateur requise."
      });
    }

    if (member.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Compte suspendu."
      });
    }

    if (member.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Accès réservé à l'administrateur."
      });
    }

    req.member = member;
    next();
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Erreur d'authentification administrateur."
    });
  }
}

/* =========================================================
   OUTILS
========================================================= */

function publicMember(member) {
  if (!member) return null;

  return {
    id: member.id,
    name: member.name,
    email: member.email,
    country: member.country,
    skills: member.skills || "",
    bio: member.bio || "",
    ideas: member.ideas || "",
    links: member.links || "",
    photo: member.photo || "",
    role: member.role || "member",
    status: member.status || "active",
    created_at: member.created_at
  };
}

function getExtension(mimetype) {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };

  return map[mimetype] || "jpg";
}

function getPhotoPath(photoUrl) {
  if (!photoUrl) return null;

  const marker = "/storage/v1/object/public/profile-photos/";

  const index = photoUrl.indexOf(marker);

  if (index === -1) {
    return null;
  }

  return decodeURIComponent(
    photoUrl.slice(index + marker.length)
  );
}

/* =========================================================
   TEST SERVEUR
========================================================= */

app.get("/api/status", async (req, res) => {
  try {
    const { error } = await supabase
      .from("members")
      .select("id")
      .limit(1);

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Supabase inaccessible.",
        error: error.message
      });
    }

    return res.json({
      success: true,
      message: "JS LENGE TECH SERVICES fonctionne avec Supabase.",
      database: "Supabase",
      storage: "profile-photos"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Erreur serveur.",
      error: error.message
    });
  }
});

/* =========================================================
   INSCRIPTION
========================================================= */

app.post("/api/register", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      country,
      skills,
      bio,
      ideas,
      links
    } = req.body;

    if (!name || !email || !password || !country) {
      return res.status(400).json({
        success: false,
        message: "Nom, email, mot de passe et pays sont obligatoires."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Le mot de passe doit contenir au moins 6 caractères."
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const { data: existing, error: existingError } = await supabase
      .from("members")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingError) {
      console.error(existingError);

      return res.status(500).json({
        success: false,
        message: "Impossible de vérifier l'email."
      });
    }

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Cette adresse email est déjà utilisée."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const { data: member, error } = await supabase
      .from("members")
      .insert({
        name: String(name).trim(),
        email: normalizedEmail,
        password_hash: passwordHash,
        country: String(country).trim(),
        skills: skills || "",
        bio: bio || "",
        ideas: ideas || "",
        links: links || "",
        photo: "",
        role: "member",
        status: "active"
      })
      .select("*")
      .single();

    if (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Erreur lors de la création du compte.",
        error: error.message
      });
    }

    return res.status(201).json({
      success: true,
      message: "Compte créé avec succès.",
      member: publicMember(member)
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Erreur serveur."
    });
  }
});

/* =========================================================
   CONNEXION
========================================================= */

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email et mot de passe obligatoires."
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const { data: member, error } = await supabase
      .from("members")
      .select("*")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Erreur de connexion."
      });
    }

    if (!member) {
      return res.status(401).json({
        success: false,
        message: "Email ou mot de passe incorrect."
      });
    }

    if (member.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Votre compte est suspendu."
      });
    }

    const passwordOk = await bcrypt.compare(
      password,
      member.password_hash
    );

    if (!passwordOk) {
      return res.status(401).json({
        success: false,
        message: "Email ou mot de passe incorrect."
      });
    }

    const token = createSession(member);

    return res.json({
      success: true,
      message: "Connexion réussie.",
      token,
      member: publicMember(member)
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Erreur serveur."
    });
  }
});

/* =========================================================
   DÉCONNEXION
========================================================= */

app.post("/api/logout", async (req, res) => {
  const auth = req.headers.authorization || "";

  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    sessions.delete(token);
  }

  return res.json({
    success: true,
    message: "Déconnexion réussie."
  });
});

/* =========================================================
   MEMBRES
========================================================= */

app.get("/api/members", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      members: data.map(publicMember)
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible de récupérer les membres."
    });
  }
});

app.get("/api/members/:id", requireAuth, async (req, res) => {
  try {
    const { data: member, error } = await supabase
      .from("members")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Membre introuvable."
      });
    }

    return res.json({
      success: true,
      member: publicMember(member)
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Erreur lors du chargement du profil."
    });
  }
});

/* =========================================================
   MODIFICATION PROFIL
========================================================= */

app.put("/api/members/:id", requireAuth, async (req, res) => {
  try {
    const isOwner = req.member.id === req.params.id;
    const isAdmin = req.member.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Vous ne pouvez pas modifier ce profil."
      });
    }

    const {
      name,
      country,
      skills,
      bio,
      ideas,
      links
    } = req.body;

    const updates = {};

    if (name !== undefined) updates.name = String(name).trim();
    if (country !== undefined) updates.country = String(country).trim();
    if (skills !== undefined) updates.skills = skills;
    if (bio !== undefined) updates.bio = bio;
    if (ideas !== undefined) updates.ideas = ideas;
    if (links !== undefined) updates.links = links;

    const { data: member, error } = await supabase
      .from("members")
      .update(updates)
      .eq("id", req.params.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      message: "Profil mis à jour avec succès.",
      member: publicMember(member)
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible de modifier le profil."
    });
  }
});

/* =========================================================
   PHOTO DE PROFIL
========================================================= */

app.post(
  "/api/members/:id/photo",
  requireAuth,
  upload.single("photo"),
  async (req, res) => {
    try {
      const isOwner = req.member.id === req.params.id;
      const isAdmin = req.member.role === "admin";

      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Vous ne pouvez pas modifier cette photo."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Aucune photo reçue."
        });
      }

      const { data: member, error: memberError } = await supabase
        .from("members")
        .select("*")
        .eq("id", req.params.id)
        .single();

      if (memberError || !member) {
        return res.status(404).json({
          success: false,
          message: "Membre introuvable."
        });
      }

      /* Supprimer l'ancienne photo */
      const oldPath = getPhotoPath(member.photo);

      if (oldPath) {
        await supabase.storage
          .from("profile-photos")
          .remove([oldPath]);
      }

      const extension = getExtension(req.file.mimetype);

      const filePath =
        `${member.id}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-photos")
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (uploadError) {
        console.error(uploadError);

        return res.status(500).json({
          success: false,
          message: "Impossible d'envoyer la photo."
        });
      }

      const {
        data: publicUrlData
      } = supabase.storage
        .from("profile-photos")
        .getPublicUrl(filePath);

      const photoUrl = publicUrlData.publicUrl;

      const { data: updatedMember, error: updateError } = await supabase
        .from("members")
        .update({
          photo: photoUrl
        })
        .eq("id", member.id)
        .select("*")
        .single();

      if (updateError) {
        throw updateError;
      }

      return res.json({
        success: true,
        message: "Photo de profil mise à jour.",
        photo: photoUrl,
        member: publicMember(updatedMember)
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Erreur lors de l'envoi de la photo."
      });
    }
  }
);

/* =========================================================
   IDÉES
========================================================= */

app.post("/api/ideas", requireAuth, async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Titre et description obligatoires."
      });
    }

    const { data: idea, error } = await supabase
      .from("ideas")
      .insert({
        member_id: req.member.id,
        member_name: req.member.name,
        title,
        description
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: "Idée publiée.",
      idea
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible de publier l'idée."
    });
  }
});

app.get("/api/ideas", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("ideas")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      ideas: data
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible de charger les idées."
    });
  }
});

/* =========================================================
   PROJETS
========================================================= */

app.post("/api/projects", requireAuth, async (req, res) => {
  try {
    const {
      title,
      description,
      status
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Titre et description obligatoires."
      });
    }

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        member_id: req.member.id,
        member_name: req.member.name,
        title,
        description,
        status: status || "proposé"
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: "Projet publié.",
      project
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible de publier le projet."
    });
  }
});

app.get("/api/projects", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      projects: data
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible de charger les projets."
    });
  }
});

/* =========================================================
   PUBLICATIONS
========================================================= */

app.post("/api/publications", requireAuth, async (req, res) => {
  try {
    const {
      title,
      content
    } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Le contenu est obligatoire."
      });
    }

    const { data: publication, error } = await supabase
      .from("publications")
      .insert({
        member_id: req.member.id,
        member_name: req.member.name,
        title: title || "",
        content
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: "Publication créée.",
      publication
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible de créer la publication."
    });
  }
});

app.get("/api/publications", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("publications")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      publications: data
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible de charger les publications."
    });
  }
});

/* =========================================================
   MESSAGES
========================================================= */

app.post("/api/messages", requireAuth, async (req, res) => {
  try {
    const {
      receiver_id,
      content
    } = req.body;

    if (!receiver_id || !content) {
      return res.status(400).json({
        success: false,
        message: "Destinataire et message obligatoires."
      });
    }

    const { data: receiver, error: receiverError } = await supabase
      .from("members")
      .select("id,name")
      .eq("id", receiver_id)
      .maybeSingle();

    if (receiverError) {
      throw receiverError;
    }

    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "Destinataire introuvable."
      });
    }

    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        sender_id: req.member.id,
        sender_name: req.member.name,
        receiver_id,
        content
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    await supabase
      .from("notifications")
      .insert({
        member_id: receiver_id,
        title: "Nouveau message",
        message: `${req.member.name} vous a envoyé un message.`,
        read: false
      });

    return res.status(201).json({
      success: true,
      message: "Message envoyé.",
      data: message
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible d'envoyer le message."
    });
  }
});

app.get("/api/messages", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(
        `sender_id.eq.${req.member.id},receiver_id.eq.${req.member.id}`
      )
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      messages: data
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible de charger les messages."
    });
  }
});

app.delete("/api/messages/:id", requireAuth, async (req, res) => {
  try {
    const { data: message, error: findError } = await supabase
      .from("messages")
      .select("id,sender_id")
      .eq("id", req.params.id)
      .maybeSingle();

    if (findError) throw findError;

    if (!message) {
      return res.status(404).json({ success: false, message: "Message introuvable." });
    }

    if (message.sender_id !== req.member.id && req.member.role !== "admin") {
      return res.status(403).json({ success: false, message: "Vous ne pouvez supprimer que vos propres messages." });
    }

    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;

    return res.json({ success: true, message: "Message supprimé." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Impossible de supprimer le message." });
  }
});

/* =========================================================
   NOTIFICATIONS
========================================================= */

app.get("/api/notifications/:id", requireAuth, async (req, res) => {
  try {
    if (req.member.id !== req.params.id && req.member.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Accès refusé."
      });
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("member_id", req.params.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      notifications: data
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible de charger les notifications."
    });
  }
});

app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    const { data: notification, error: findError } = await supabase
      .from("notifications")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification introuvable."
      });
    }

    if (
      notification.member_id !== req.member.id &&
      req.member.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Accès refusé."
      });
    }

    const { data, error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", req.params.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      message: "Notification marquée comme lue.",
      notification: data
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible de modifier la notification."
    });
  }
});

/* =========================================================
   LIENS
========================================================= */

app.post("/api/links", requireAuth, async (req, res) => {
  try {
    const {
      title,
      url
    } = req.body;

    if (!title || !url) {
      return res.status(400).json({
        success: false,
        message: "Titre et URL obligatoires."
      });
    }

    const { data: link, error } = await supabase
      .from("links")
      .insert({
        member_id: req.member.id,
        member_name: req.member.name,
        title,
        url,
        status: "pending"
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: "Lien envoyé pour validation.",
      link
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible d'ajouter le lien."
    });
  }
});

app.get("/api/links", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("links")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      links: data
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible de charger les liens."
    });
  }
});

/* =========================================================
   ADMIN - TABLEAU DE BORD
========================================================= */

app.get("/api/admin/dashboard", requireAdmin, async (req, res) => {
  try {
    const [
      membersResult,
      ideasResult,
      projectsResult,
      publicationsResult,
      messagesResult,
      linksResult
    ] = await Promise.all([
      supabase.from("members").select("*").order("created_at", {
        ascending: false
      }),

      supabase.from("ideas").select("*"),

      supabase.from("projects").select("*"),

      supabase.from("publications").select("*"),

      supabase.from("messages").select("*"),

      supabase.from("links").select("*")
    ]);

    const results = [
      membersResult,
      ideasResult,
      projectsResult,
      publicationsResult,
      messagesResult,
      linksResult
    ];

    const failed = results.find((result) => result.error);

    if (failed) {
      throw failed.error;
    }

    const members = membersResult.data || [];
    const ideas = ideasResult.data || [];
    const projects = projectsResult.data || [];
    const publications = publicationsResult.data || [];
    const messages = messagesResult.data || [];
    const links = linksResult.data || [];

    const activeMembers = members.filter(
      (member) => member.status === "active"
    ).length;

    const suspendedMembers = members.filter(
      (member) => member.status === "suspended"
    ).length;

    const pendingLinks = links.filter(
      (link) => link.status === "pending"
    ).length;

    return res.json({
      success: true,

      statistics: {
        members: members.length,
        activeMembers,
        suspendedMembers,
        ideas: ideas.length,
        projects: projects.length,
        publications: publications.length,
        messages: messages.length,
        linksPending: pendingLinks
      },

      members: members.map(publicMember),
      ideas,
      projects,
      publications,
      messages,
      links
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible de charger le tableau de bord."
    });
  }
});

/* =========================================================
   ADMIN - SUPPRIMER MEMBRE
========================================================= */

app.delete("/api/admin/members/:id", requireAdmin, async (req, res) => {
  try {
    if (req.params.id === req.member.id) {
      return res.status(400).json({
        success: false,
        message: "Vous ne pouvez pas supprimer votre propre compte."
      });
    }

    const { data: member, error: findError } = await supabase
      .from("members")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Membre introuvable."
      });
    }

    const oldPath = getPhotoPath(member.photo);

    if (oldPath) {
      await supabase.storage
        .from("profile-photos")
        .remove([oldPath]);
    }

    const { error } = await supabase
      .from("members")
      .delete()
      .eq("id", req.params.id);

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      message: "Membre supprimé."
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Impossible de supprimer le membre."
    });
  }
});

/* =========================================================
   ADMIN - STATUT MEMBRE
========================================================= */

app.patch(
  "/api/admin/members/:id/status",
  requireAdmin,
  async (req, res) => {
    try {
      const { status } = req.body;

      if (!["active", "suspended"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Statut invalide."
        });
      }

      if (req.params.id === req.member.id) {
        return res.status(400).json({
          success: false,
          message: "Vous ne pouvez pas suspendre votre propre compte."
        });
      }

      const { data: member, error } = await supabase
        .from("members")
        .update({ status })
        .eq("id", req.params.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return res.json({
        success: true,
        message:
          status === "active"
            ? "Membre activé."
            : "Membre suspendu.",
        member: publicMember(member)
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Impossible de modifier le statut."
      });
    }
  }
);

/* =========================================================
   ADMIN - STATUT LIEN
========================================================= */

app.patch(
  "/api/admin/links/:id/status",
  requireAdmin,
  async (req, res) => {
    try {
      const { status } = req.body;

      if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Statut du lien invalide."
        });
      }

      const { data: link, error } = await supabase
        .from("links")
        .update({ status })
        .eq("id", req.params.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return res.json({
        success: true,
        message: "Statut du lien mis à jour.",
        link
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Impossible de modifier le lien."
      });
    }
  }
);

/* =========================================================
   ERREURS MULTER
========================================================= */

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "La photo ne doit pas dépasser 5 Mo."
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  if (error) {
    console.error(error);

    return res.status(400).json({
      success: false,
      message: error.message || "Erreur."
    });
  }

  next();
});

/* =========================================================
   FICHIERS DU SITE
========================================================= */

app.use(express.static(path.join(__dirname, "public")));

/* =========================================================
   PAGE PRINCIPALE
========================================================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================================================
   DÉMARRAGE
========================================================= */

app.listen(PORT, () => {
  console.log("");
  console.log("==========================================");
  console.log("   JS LENGE TECH SERVICES");
  console.log("==========================================");
  console.log(`Serveur démarré sur le port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log("Base de données : Supabase");
  console.log("Stockage photos : profile-photos");
  console.log("==========================================");
  console.log("");
});
