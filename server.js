const express = require("express");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = 3000;

// Middleware CORS : Autorise les requêtes depuis n'importe quelle origine (nécessaire pour index.html)
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] REQUÊTE REÇUE : ${req.method} ${req.url}`);
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.send("Le serveur API Dark Kitchen fonctionne !");
});

const SUPABASE_URL = "https://yftaggyurqpyyuxhsuhf.supabase.co";
const SUPABASE_KEY = "sb_publishable_03rWk-XyJY5N-FLT8UIrrA_k8sAOSDj";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

try {
  const swaggerDocument = YAML.load("./swagger.yaml");
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (err) {
  console.log("Info: swagger.yaml non trouvé, documentation API désactivée pour éviter le crash.");
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE AUTH — vérifie le token JWT sur toutes les routes /api/*
// sauf /api/auth/*
// ═══════════════════════════════════════════════════════════════════════════════

const verifierToken = async (req, res, next) => {
  // Routes publiques exemptées d'authentification
  const routesPubliques = ["/auth/login", "/auth/register", "/auth/reset-password", "/auth/resend-confirmation"];
  if (routesPubliques.includes(req.path)) return next();
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token manquant. Connectez-vous d'abord via POST /api/auth/login" });
  }

  const token = authHeader.split(" ")[1];

  // Supabase vérifie le token et retourne l'utilisateur
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ message: "Token invalide ou expire" });
  }

  // Attache l'utilisateur à la requête pour les routes suivantes
  req.user = user;
  next();
};

// Applique le middleware sur toutes les routes /api/*
app.use("/api", verifierToken);

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/auth/register → crée un compte
app.post("/api/auth/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "email et password sont requis" });

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) return res.status(400).json({ message: error.message });

  res.status(201).json({
    message: "Compte cree avec succes. Verifiez votre email pour confirmer.",
    user: { id: data.user.id, email: data.user.email }
  });
});

// POST /api/auth/login → connexion, retourne le token JWT
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "email et password sont requis" });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return res.status(401).json({ message: error.message });

  res.json({
    access_token: data.session.access_token,   // ← token à utiliser dans Authorization header
    token_type: "Bearer",
    expires_in: data.session.expires_in,
    user: { id: data.user.id, email: data.user.email }
  });
});

// POST /api/auth/logout → déconnexion
app.post("/api/auth/logout", async (req, res) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  const { error } = await supabase.auth.admin.signOut(token);
  if (error) return res.status(500).json({ message: error.message });
  res.json({ message: "Deconnecte avec succes" });
});

// ─── ROUTES SMTP (desactivees temporairement - a reactiver apres config SMTP) ──
// POST /api/auth/resend-confirmation
// app.post("/api/auth/resend-confirmation", async (req, res) => { ... });
//
// POST /api/auth/reset-password
// app.post("/api/auth/reset-password", async (req, res) => { ... });
// ──────────────────────────────────────────────────────────────────────────────

// PUT /api/auth/update-email (desactive temporairement - necessite SMTP)
// app.put("/api/auth/update-email", async (req, res) => { ... });


// DELETE /api/auth/delete-account → supprimer le compte de l'utilisateur
app.delete("/api/auth/delete-account", async (req, res) => {
  const user_id = req.user.id;

  const result = await supabase.auth.admin.deleteUser(user_id);
  const data = result?.data;
  const error = result?.error;

  if (error) return res.status(500).json({ message: error.message });

  res.json({ message: "Compte supprime avec succes" });
});

// PUT /api/auth/users/:id/password → changer le mot de passe d'un utilisateur par son ID (admin)
app.put("/api/auth/users/:id/password", async (req, res) => {
  const { password } = req.body;
  const { id } = req.params;

  if (!password)
    return res.status(400).json({ message: "Le nouveau mot de passe est requis" });
  if (password.length < 6)
    return res.status(400).json({ message: "Le mot de passe doit contenir au moins 6 caracteres" });

  const result = await supabase.auth.admin.updateUserById(id, { password });
  const error = result?.error;

  if (error) return res.status(400).json({ message: error.message });

  res.json({ message: "Mot de passe mis a jour avec succes pour l'utilisateur " + id });
});

// GET /api/auth/me → infos de l'utilisateur connecté
app.get("/api/auth/me", async (req, res) => {
  res.json({ user: req.user });
});

// ═══ CLIENTS ═════════════════════════════════════════════════════════════════

app.get("/api/clients", async (req, res) => {
  const { data, error } = await supabase.from("clients").select("*");
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

app.get("/api/clients/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("clients").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ message: "Client non trouve" });
  res.json(data);
});

app.post("/api/clients", async (req, res) => {
  const { nom, prenom, email, telephone, adresse } = req.body;
  if (!nom || !prenom || !email)
    return res.status(400).json({ message: "nom, prenom et email sont requis" });
  const { data, error } = await supabase
    .from("clients").insert([{ nom, prenom, email, telephone, adresse }]).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.status(201).json(data);
});

app.put("/api/clients/:id", async (req, res) => {
  const { nom, prenom, email, telephone, adresse } = req.body;
  const { data, error } = await supabase
    .from("clients").update({ nom, prenom, email, telephone, adresse })
    .eq("id", req.params.id).select().single();
  if (error) return res.status(error.code === "PGRST116" ? 404 : 500).json({ message: error.code === "PGRST116" ? "Client non trouve" : error.message });
  res.json(data);
});

app.delete("/api/clients/:id", async (req, res) => {
  const { error } = await supabase.from("clients").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json({ message: "Client " + req.params.id + " supprime" });
});

app.get("/api/clients/:id/commandes", async (req, res) => {
  const { data, error } = await supabase
    .from("commandes")
    .select("*, restaurants(nom), commandes_produits(quantite, prix_unitaire, produits(nom))")
    .eq("client_id", req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

// ═══ RESTAURANTS ══════════════════════════════════════════════════════════════

app.get("/api/restaurants", async (req, res) => {
  const { data, error } = await supabase.from("restaurants").select("*");
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

app.get("/api/restaurants/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("restaurants").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ message: "Restaurant non trouve" });
  res.json(data);
});

app.get("/api/restaurants/:id/produits", async (req, res) => {
  const { data, error } = await supabase
    .from("produits").select("*").eq("restaurant_id", req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

app.post("/api/restaurants", async (req, res) => {
  const { nom, cuisine } = req.body;
  if (!nom || !cuisine)
    return res.status(400).json({ message: "nom et cuisine sont requis" });
  const { data, error } = await supabase
    .from("restaurants").insert([{ nom, cuisine }]).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.status(201).json(data);
});

app.put("/api/restaurants/:id", async (req, res) => {
  const { nom, cuisine } = req.body;
  const { data, error } = await supabase
    .from("restaurants").update({ nom, cuisine })
    .eq("id", req.params.id).select().single();
  if (error) return res.status(error.code === "PGRST116" ? 404 : 500).json({ message: error.code === "PGRST116" ? "Restaurant non trouve" : error.message });
  res.json(data);
});

app.delete("/api/restaurants/:id", async (req, res) => {
  const { error } = await supabase.from("restaurants").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json({ message: "Restaurant " + req.params.id + " supprime" });
});

app.get("/api/restaurants/:id/commandes", async (req, res) => {
  const { data, error } = await supabase
    .from("commandes")
    .select("*, clients(nom, prenom), commandes_produits(quantite, prix_unitaire, produits(nom))")
    .eq("restaurant_id", req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

// ═══ PRODUITS ═════════════════════════════════════════════════════════════════

app.get("/api/produits", async (req, res) => {
  const { data, error } = await supabase.from("produits").select("*");
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

app.get("/api/produits/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ message: "Le parametre de recherche 'q' est requis" });
  const { data, error } = await supabase
    .from("produits").select("*, restaurants(nom)").ilike("nom", `%${q}%`);
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

app.get("/api/produits/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("produits").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ message: "Produit non trouve" });
  res.json(data);
});

app.post("/api/produits", async (req, res) => {
  const { restaurant_id, nom, description, prix, categorie } = req.body;
  if (!restaurant_id || !nom || !prix)
    return res.status(400).json({ message: "restaurant_id, nom et prix sont requis" });
  const { data, error } = await supabase
    .from("produits").insert([{ restaurant_id, nom, description, prix, categorie }]).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.status(201).json(data);
});

app.put("/api/produits/:id", async (req, res) => {
  const { nom, description, prix, categorie, disponible } = req.body;
  const { data, error } = await supabase
    .from("produits").update({ nom, description, prix, categorie, disponible })
    .eq("id", req.params.id).select().single();
  if (error) return res.status(error.code === "PGRST116" ? 404 : 500).json({ message: error.code === "PGRST116" ? "Produit non trouve" : error.message });
  res.json(data);
});

app.delete("/api/produits/:id", async (req, res) => {
  const { error } = await supabase.from("produits").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json({ message: "Produit " + req.params.id + " supprime" });
});

// ═══ COMMANDES ════════════════════════════════════════════════════════════════

app.get("/api/commandes", async (req, res) => {
  const { data, error } = await supabase
    .from("commandes")
    .select("*, clients(nom, prenom), restaurants(nom), commandes_produits(quantite, prix_unitaire, produits(nom))");
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

app.get("/api/commandes/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("commandes")
    .select("*, clients(nom, prenom), restaurants(nom), commandes_produits(quantite, prix_unitaire, produits(nom))")
    .eq("id", req.params.id).single();
  if (error) return res.status(404).json({ message: "Commande non trouvee" });
  res.json(data);
});

app.post("/api/commandes", async (req, res) => {
  const { client_id, restaurant_id, adresse_livraison, produits } = req.body;
  if (!client_id || !restaurant_id || !adresse_livraison || !produits?.length)
    return res.status(400).json({ message: "client_id, restaurant_id, adresse_livraison et produits sont requis" });

  const total = produits.reduce((sum, p) => sum + p.prix_unitaire * p.quantite, 0);

  const { data: commande, error: errCommande } = await supabase
    .from("commandes").insert([{ client_id, restaurant_id, adresse_livraison, total }]).select().single();
  if (errCommande) return res.status(500).json({ message: errCommande.message });

  const lignes = produits.map(p => ({
    commande_id: commande.id,
    produit_id: p.produit_id,
    quantite: p.quantite,
    prix_unitaire: p.prix_unitaire
  }));

  const { error: errLignes } = await supabase.from("commandes_produits").insert(lignes);
  if (errLignes) return res.status(500).json({ message: errLignes.message });

  res.status(201).json(commande);
});

app.patch("/api/commandes/:id/statut", async (req, res) => {
  const { statut } = req.body;
  const statuts = ["en_attente", "en_preparation", "prete", "en_livraison", "livree", "annulee"];
  if (!statuts.includes(statut))
    return res.status(400).json({ message: "Statut invalide. Valeurs possibles : " + statuts.join(", ") });
  const { data, error } = await supabase
    .from("commandes").update({ statut }).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

app.delete("/api/commandes/:id", async (req, res) => {
  // Supprimer d'abord les lignes de commande, puis la commande elle-même
  const { error: errLignes } = await supabase.from("commandes_produits").delete().eq("commande_id", req.params.id);
  if (errLignes) return res.status(500).json({ message: errLignes.message });
  const { error } = await supabase.from("commandes").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json({ message: "Commande " + req.params.id + " supprimee" });
});

// ═══ LIVREURS ═════════════════════════════════════════════════════════════════

app.get("/api/livreurs", async (req, res) => {
  const { data, error } = await supabase.from("livreurs").select("*");
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

app.get("/api/livreurs/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("livreurs").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ message: "Livreur non trouve" });
  res.json(data);
});

app.post("/api/livreurs", async (req, res) => {
  const { nom, prenom, telephone } = req.body;
  if (!nom || !prenom || !telephone)
    return res.status(400).json({ message: "nom, prenom et telephone sont requis" });
  const { data, error } = await supabase
    .from("livreurs").insert([{ nom, prenom, telephone }]).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.status(201).json(data);
});

app.put("/api/livreurs/:id", async (req, res) => {
  const { nom, prenom, telephone, statut } = req.body;
  const { data, error } = await supabase
    .from("livreurs").update({ nom, prenom, telephone, statut })
    .eq("id", req.params.id).select().single();
  if (error) return res.status(error.code === "PGRST116" ? 404 : 500).json({ message: error.code === "PGRST116" ? "Livreur non trouve" : error.message });
  res.json(data);
});

app.delete("/api/livreurs/:id", async (req, res) => {
  const { error } = await supabase.from("livreurs").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json({ message: "Livreur " + req.params.id + " supprime" });
});

app.get("/api/livreurs/:id/livraisons", async (req, res) => {
  const { data, error } = await supabase
    .from("livraisons")
    .select("*, commandes(id, statut, adresse_livraison, total)")
    .eq("livreur_id", req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

// ═══ LIVRAISONS ═══════════════════════════════════════════════════════════════

app.get("/api/livraisons", async (req, res) => {
  const { data, error } = await supabase
    .from("livraisons")
    .select("*, commandes(id, statut, adresse_livraison), livreurs(nom, prenom)");
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

app.get("/api/livraisons/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("livraisons")
    .select("*, commandes(id, statut, adresse_livraison, total), livreurs(nom, prenom)")
    .eq("id", req.params.id).single();
  if (error) return res.status(404).json({ message: "Livraison non trouvee" });
  res.json(data);
});

app.post("/api/livraisons", async (req, res) => {
  const { commande_id, livreur_id } = req.body;
  if (!commande_id || !livreur_id)
    return res.status(400).json({ message: "commande_id et livreur_id sont requis" });

  const { data, error } = await supabase
    .from("livraisons").insert([{ commande_id, livreur_id, heure_depart: new Date() }]).select().single();
  if (error) return res.status(500).json({ message: error.message });

  const { error: errStatut } = await supabase.from("livreurs").update({ statut: "en_livraison" }).eq("id", livreur_id);
  if (errStatut) console.error(`[livraisons] Impossible de mettre à jour le statut du livreur ${livreur_id}:`, errStatut.message);

  res.status(201).json(data);
});

app.patch("/api/livraisons/:id/livrer", async (req, res) => {
  const { data: livraison, error } = await supabase
    .from("livraisons")
    .update({ statut: "livree", heure_arrivee: new Date() })
    .eq("id", req.params.id).select().single();
  if (error || !livraison) return res.status(500).json({ message: error?.message || "Livraison non trouvee" });

  const { error: errLivreur } = await supabase.from("livreurs").update({ statut: "disponible" }).eq("id", livraison.livreur_id);
  if (errLivreur) console.error(`[livraisons] Impossible de libérer le livreur ${livraison.livreur_id}:`, errLivreur.message);

  const { error: errCommande } = await supabase.from("commandes").update({ statut: "livree" }).eq("id", livraison.commande_id);
  if (errCommande) console.error(`[livraisons] Impossible de mettre à jour la commande ${livraison.commande_id}:`, errCommande.message);

  res.json(livraison);
});

// ═══ STATISTIQUES ════════════════════════════════════════════════════════════

app.get("/api/stats/dashboard", async (req, res) => {
  const [resCommandes, resClients, resRestaurants, resLivreurs, resProduits] = await Promise.all([
    supabase.from("commandes").select("id, total, statut, created_at"),
    supabase.from("clients").select("id"),
    supabase.from("restaurants").select("id"),
    supabase.from("livreurs").select("id, statut"),
    supabase.from("commandes_produits").select("produit_id, quantite, produits(nom)"),
  ]);

  if (resCommandes.error) return res.status(500).json({ message: resCommandes.error.message });

  const commandes = resCommandes.data || [];
  const clients = resClients.data || [];
  const restaurants = resRestaurants.data || [];
  const livreurs = resLivreurs.data || [];
  const lignes = resProduits.data || [];

  const chiffre_affaires = commandes.reduce((sum, c) => sum + (c.total || 0), 0);
  const commandes_par_statut = commandes.reduce((acc, c) => {
    acc[c.statut] = (acc[c.statut] || 0) + 1;
    return acc;
  }, {});
  const livreurs_disponibles = livreurs.filter(l => l.statut === "disponible").length;

  // Top 5 produits les plus commandés
  const produitsMap = {};
  lignes.forEach(l => {
    const nom = l.produits?.nom || "Inconnu";
    produitsMap[nom] = (produitsMap[nom] || 0) + (l.quantite || 1);
  });
  const top_produits = Object.entries(produitsMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nom, quantite]) => ({ nom, quantite }));

  res.json({
    total_commandes: commandes.length,
    chiffre_affaires,
    commandes_par_statut,
    total_clients: clients.length,
    total_restaurants: restaurants.length,
    total_livreurs: livreurs.length,
    livreurs_disponibles,
    top_produits,
  });
});

// ─── Demarrage ────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log("Serveur demarre sur http://localhost:" + PORT);
    console.log("Swagger disponible sur http://localhost:" + PORT + "/api-docs");
  });
}

module.exports = app;
