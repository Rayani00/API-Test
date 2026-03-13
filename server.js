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
  // Exemption des routes auth
  if (req.path.startsWith("/auth")) return next();
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
  await supabase.auth.admin.signOut(token);
  res.json({ message: "Deconnecte avec succes" });
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
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

app.delete("/api/clients/:id", async (req, res) => {
  const { error } = await supabase.from("clients").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json({ message: "Client " + req.params.id + " supprime" });
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

// ═══ PRODUITS ═════════════════════════════════════════════════════════════════

app.get("/api/produits", async (req, res) => {
  const { data, error } = await supabase.from("produits").select("*");
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
  if (error) return res.status(500).json({ message: error.message });
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

// ═══ LIVREURS ═════════════════════════════════════════════════════════════════

app.get("/api/livreurs", async (req, res) => {
  const { data, error } = await supabase.from("livreurs").select("*");
  if (error) return res.status(500).json({ message: error.message });
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

// ═══ LIVRAISONS ═══════════════════════════════════════════════════════════════

app.get("/api/livraisons", async (req, res) => {
  const { data, error } = await supabase
    .from("livraisons")
    .select("*, commandes(id, statut, adresse_livraison), livreurs(nom, prenom)");
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

app.post("/api/livraisons", async (req, res) => {
  const { commande_id, livreur_id } = req.body;
  if (!commande_id || !livreur_id)
    return res.status(400).json({ message: "commande_id et livreur_id sont requis" });

  const { data, error } = await supabase
    .from("livraisons").insert([{ commande_id, livreur_id, heure_depart: new Date() }]).select().single();
  if (error) return res.status(500).json({ message: error.message });

  await supabase.from("livreurs").update({ statut: "en_livraison" }).eq("id", livreur_id);
  res.status(201).json(data);
});

app.patch("/api/livraisons/:id/livrer", async (req, res) => {
  const { data: livraison, error } = await supabase
    .from("livraisons")
    .update({ statut: "livree", heure_arrivee: new Date() })
    .eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ message: error.message });

  await supabase.from("livreurs").update({ statut: "disponible" }).eq("id", livraison.livreur_id);
  await supabase.from("commandes").update({ statut: "livree" }).eq("id", livraison.commande_id);
  res.json(livraison);
});

// ─── Demarrage ────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log("Serveur demarre sur http://localhost:" + PORT);
    console.log("Swagger disponible sur http://localhost:" + PORT + "/api-docs");
  });
}

module.exports = app;
