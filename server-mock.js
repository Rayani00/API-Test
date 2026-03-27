/**
 * Serveur mock — remplace Supabase par des données en mémoire
 * Utilisé pour les tests E2E sur l'interface sans dépendance externe
 * Lancer avec: node server-mock.js
 */
const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = 3000;

// ─── Données en mémoire ──────────────────────────────────────────────────────
const db = {
  users: [],
  clients: [
    { id: "c1", nom: "Dupont", prenom: "Marie", email: "marie@test.com", telephone: "0601020304", adresse: "12 rue de Paris" },
    { id: "c2", nom: "Martin", prenom: "Lucas", email: "lucas@test.com", telephone: "0605060708", adresse: "5 avenue Victor Hugo" },
  ],
  restaurants: [
    { id: "r1", nom: "Burger Palace", cuisine: "burgers", actif: true },
    { id: "r2", nom: "Sushi Master", cuisine: "sushi", actif: true },
    { id: "r3", nom: "Pizza Roma", cuisine: "pizza", actif: true },
  ],
  produits: [
    { id: "p1", restaurant_id: "r1", nom: "Classic Burger", description: "Boeuf, salade, tomate, oignons", prix: 9.50, categorie: "plat", disponible: true },
    { id: "p2", restaurant_id: "r1", nom: "Cheese Burger", description: "Double fromage, bacon croustillant", prix: 11.00, categorie: "plat", disponible: true },
    { id: "p3", restaurant_id: "r1", nom: "Frites Maison", description: "Frites fraîches coupées main", prix: 4.50, categorie: "accompagnement", disponible: true },
    { id: "p4", restaurant_id: "r1", nom: "Coca-Cola", description: "33cl", prix: 3.00, categorie: "boisson", disponible: true },
    { id: "p5", restaurant_id: "r2", nom: "Sashimi Saumon", description: "8 pièces de saumon frais", prix: 14.00, categorie: "plat", disponible: true },
    { id: "p6", restaurant_id: "r2", nom: "Maki Thon", description: "6 makis thon avocat", prix: 10.50, categorie: "plat", disponible: true },
    { id: "p7", restaurant_id: "r2", nom: "Soupe Miso", description: "Soupe traditionnelle japonaise", prix: 4.00, categorie: "entree", disponible: true },
    { id: "p8", restaurant_id: "r2", nom: "Thé vert", description: "Thé vert sencha", prix: 2.50, categorie: "boisson", disponible: true },
    { id: "p9", restaurant_id: "r3", nom: "Margherita", description: "Tomate, mozzarella, basilic", prix: 10.00, categorie: "plat", disponible: true },
    { id: "p10", restaurant_id: "r3", nom: "Quattro Formaggi", description: "4 fromages italiens", prix: 13.00, categorie: "plat", disponible: true },
    { id: "p11", restaurant_id: "r3", nom: "Tiramisu", description: "Dessert italien traditionnel", prix: 6.50, categorie: "dessert", disponible: true },
    { id: "p12", restaurant_id: "r3", nom: "Bruschetta", description: "Tomates fraîches, ail, basilic", prix: 5.00, categorie: "entree", disponible: false },
  ],
  commandes: [],
  commandes_produits: [],
  livreurs: [
    { id: "l1", nom: "Bernard", prenom: "Thomas", telephone: "0611223344", statut: "disponible" },
    { id: "l2", nom: "Petit", prenom: "Sophie", telephone: "0655667788", statut: "disponible" },
  ],
  livraisons: [],
};

let idCounter = 100;
function newId() { return String(++idCounter); }

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] REQUÊTE REÇUE : ${req.method} ${req.url}`);
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(__dirname));

// ─── Auth Mock ───────────────────────────────────────────────────────────────
const verifierToken = (req, res, next) => {
  const routesPubliques = ["/auth/login", "/auth/register", "/auth/reset-password", "/auth/resend-confirmation"];
  if (routesPubliques.includes(req.path)) return next();
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token manquant. Connectez-vous d'abord via POST /api/auth/login" });
  }
  const token = authHeader.split(" ")[1];
  const user = db.users.find(u => u.token === token);
  if (!user) return res.status(401).json({ message: "Token invalide ou expire" });
  req.user = user;
  next();
};

app.use("/api", verifierToken);

app.post("/api/auth/register", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "email et password sont requis" });
  if (db.users.find(u => u.email === email)) return res.status(400).json({ message: "Un compte existe deja avec cet email" });
  const user = { id: newId(), email, password, token: crypto.randomBytes(32).toString("hex") };
  db.users.push(user);
  res.status(201).json({ message: "Compte cree avec succes. Verifiez votre email pour confirmer.", user: { id: user.id, email: user.email } });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "email et password sont requis" });
  const user = db.users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ message: "Email ou mot de passe incorrect" });
  user.token = crypto.randomBytes(32).toString("hex");
  res.json({ access_token: user.token, token_type: "Bearer", expires_in: 3600, user: { id: user.id, email: user.email } });
});

app.post("/api/auth/logout", (req, res) => {
  if (req.user) req.user.token = null;
  res.json({ message: "Deconnecte avec succes" });
});

app.delete("/api/auth/delete-account", (req, res) => {
  db.users = db.users.filter(u => u.id !== req.user.id);
  res.json({ message: "Compte supprime avec succes" });
});

app.put("/api/auth/users/:id/password", (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ message: "Le nouveau mot de passe est requis" });
  if (password.length < 6) return res.status(400).json({ message: "Le mot de passe doit contenir au moins 6 caracteres" });
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ message: "Utilisateur non trouve" });
  user.password = password;
  res.json({ message: "Mot de passe mis a jour avec succes pour l'utilisateur " + req.params.id });
});

app.get("/api/auth/me", (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email } });
});

// ─── CLIENTS ─────────────────────────────────────────────────────────────────
app.get("/api/clients", (req, res) => res.json(db.clients));
app.get("/api/clients/:id", (req, res) => {
  const c = db.clients.find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ message: "Client non trouve" });
  res.json(c);
});
app.post("/api/clients", (req, res) => {
  const { nom, prenom, email, telephone, adresse } = req.body;
  if (!nom || !prenom || !email) return res.status(400).json({ message: "nom, prenom et email sont requis" });
  const c = { id: newId(), nom, prenom, email, telephone, adresse };
  db.clients.push(c);
  res.status(201).json(c);
});
app.put("/api/clients/:id", (req, res) => {
  const c = db.clients.find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ message: "Client non trouve" });
  Object.assign(c, req.body);
  res.json(c);
});
app.delete("/api/clients/:id", (req, res) => {
  db.clients = db.clients.filter(c => c.id !== req.params.id);
  res.json({ message: "Client " + req.params.id + " supprime" });
});
app.get("/api/clients/:id/commandes", (req, res) => {
  const cmds = db.commandes.filter(c => c.client_id === req.params.id).map(c => ({
    ...c,
    restaurants: db.restaurants.find(r => r.id === c.restaurant_id) || null,
    commandes_produits: db.commandes_produits.filter(cp => cp.commande_id === c.id).map(cp => ({
      ...cp, produits: db.produits.find(p => p.id === cp.produit_id) || null
    }))
  }));
  res.json(cmds);
});

// ─── RESTAURANTS ─────────────────────────────────────────────────────────────
app.get("/api/restaurants", (req, res) => res.json(db.restaurants));
app.get("/api/restaurants/:id", (req, res) => {
  const r = db.restaurants.find(r => r.id === req.params.id);
  if (!r) return res.status(404).json({ message: "Restaurant non trouve" });
  res.json(r);
});
app.get("/api/restaurants/:id/produits", (req, res) => {
  res.json(db.produits.filter(p => p.restaurant_id === req.params.id));
});
app.post("/api/restaurants", (req, res) => {
  const { nom, cuisine } = req.body;
  if (!nom || !cuisine) return res.status(400).json({ message: "nom et cuisine sont requis" });
  const r = { id: newId(), nom, cuisine, actif: true };
  db.restaurants.push(r);
  res.status(201).json(r);
});
app.put("/api/restaurants/:id", (req, res) => {
  const r = db.restaurants.find(r => r.id === req.params.id);
  if (!r) return res.status(404).json({ message: "Restaurant non trouve" });
  Object.assign(r, req.body);
  res.json(r);
});
app.delete("/api/restaurants/:id", (req, res) => {
  db.restaurants = db.restaurants.filter(r => r.id !== req.params.id);
  res.json({ message: "Restaurant " + req.params.id + " supprime" });
});
app.get("/api/restaurants/:id/commandes", (req, res) => {
  const cmds = db.commandes.filter(c => c.restaurant_id === req.params.id).map(c => ({
    ...c,
    clients: db.clients.find(cl => cl.id === c.client_id) || null,
    commandes_produits: db.commandes_produits.filter(cp => cp.commande_id === c.id).map(cp => ({
      ...cp, produits: db.produits.find(p => p.id === cp.produit_id) || null
    }))
  }));
  res.json(cmds);
});

// ─── PRODUITS ────────────────────────────────────────────────────────────────
app.get("/api/produits/search", (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ message: "Le parametre de recherche 'q' est requis" });
  const results = db.produits.filter(p => p.nom.toLowerCase().includes(q.toLowerCase())).map(p => ({
    ...p, restaurants: db.restaurants.find(r => r.id === p.restaurant_id) || null
  }));
  res.json(results);
});
app.get("/api/produits", (req, res) => res.json(db.produits));
app.get("/api/produits/:id", (req, res) => {
  const p = db.produits.find(p => p.id === req.params.id);
  if (!p) return res.status(404).json({ message: "Produit non trouve" });
  res.json(p);
});
app.post("/api/produits", (req, res) => {
  const { restaurant_id, nom, description, prix, categorie } = req.body;
  if (!restaurant_id || !nom || !prix) return res.status(400).json({ message: "restaurant_id, nom et prix sont requis" });
  const p = { id: newId(), restaurant_id, nom, description, prix, categorie, disponible: true };
  db.produits.push(p);
  res.status(201).json(p);
});
app.put("/api/produits/:id", (req, res) => {
  const p = db.produits.find(p => p.id === req.params.id);
  if (!p) return res.status(404).json({ message: "Produit non trouve" });
  Object.assign(p, req.body);
  res.json(p);
});
app.delete("/api/produits/:id", (req, res) => {
  db.produits = db.produits.filter(p => p.id !== req.params.id);
  res.json({ message: "Produit " + req.params.id + " supprime" });
});

// ─── COMMANDES ───────────────────────────────────────────────────────────────
app.get("/api/commandes", (req, res) => {
  const cmds = db.commandes.map(c => ({
    ...c,
    clients: db.clients.find(cl => cl.id === c.client_id) || null,
    restaurants: db.restaurants.find(r => r.id === c.restaurant_id) || null,
    commandes_produits: db.commandes_produits.filter(cp => cp.commande_id === c.id).map(cp => ({
      ...cp, produits: db.produits.find(p => p.id === cp.produit_id) || null
    }))
  }));
  res.json(cmds);
});
app.get("/api/commandes/:id", (req, res) => {
  const c = db.commandes.find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ message: "Commande non trouvee" });
  res.json({
    ...c,
    clients: db.clients.find(cl => cl.id === c.client_id) || null,
    restaurants: db.restaurants.find(r => r.id === c.restaurant_id) || null,
    commandes_produits: db.commandes_produits.filter(cp => cp.commande_id === c.id).map(cp => ({
      ...cp, produits: db.produits.find(p => p.id === cp.produit_id) || null
    }))
  });
});
app.post("/api/commandes", (req, res) => {
  const { client_id, restaurant_id, adresse_livraison, produits } = req.body;
  if (!client_id || !restaurant_id || !adresse_livraison || !produits?.length)
    return res.status(400).json({ message: "client_id, restaurant_id, adresse_livraison et produits sont requis" });
  const total = produits.reduce((sum, p) => sum + p.prix_unitaire * p.quantite, 0);
  const commande = { id: newId(), client_id, restaurant_id, adresse_livraison, total, statut: "en_attente", created_at: new Date().toISOString() };
  db.commandes.push(commande);
  const lignes = produits.map(p => ({ id: newId(), commande_id: commande.id, produit_id: p.produit_id, quantite: p.quantite, prix_unitaire: p.prix_unitaire }));
  db.commandes_produits.push(...lignes);
  res.status(201).json(commande);
});
app.patch("/api/commandes/:id/statut", (req, res) => {
  const { statut } = req.body;
  const statuts = ["en_attente", "en_preparation", "prete", "en_livraison", "livree", "annulee"];
  if (!statuts.includes(statut)) return res.status(400).json({ message: "Statut invalide. Valeurs possibles : " + statuts.join(", ") });
  const c = db.commandes.find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ message: "Commande non trouvee" });
  c.statut = statut;
  res.json(c);
});
app.delete("/api/commandes/:id", (req, res) => {
  db.commandes_produits = db.commandes_produits.filter(cp => cp.commande_id !== req.params.id);
  db.commandes = db.commandes.filter(c => c.id !== req.params.id);
  res.json({ message: "Commande " + req.params.id + " supprimee" });
});

// ─── LIVREURS ────────────────────────────────────────────────────────────────
app.get("/api/livreurs", (req, res) => res.json(db.livreurs));
app.get("/api/livreurs/:id", (req, res) => {
  const l = db.livreurs.find(l => l.id === req.params.id);
  if (!l) return res.status(404).json({ message: "Livreur non trouve" });
  res.json(l);
});
app.post("/api/livreurs", (req, res) => {
  const { nom, prenom, telephone } = req.body;
  if (!nom || !prenom || !telephone) return res.status(400).json({ message: "nom, prenom et telephone sont requis" });
  const l = { id: newId(), nom, prenom, telephone, statut: "disponible" };
  db.livreurs.push(l);
  res.status(201).json(l);
});
app.put("/api/livreurs/:id", (req, res) => {
  const l = db.livreurs.find(l => l.id === req.params.id);
  if (!l) return res.status(404).json({ message: "Livreur non trouve" });
  Object.assign(l, req.body);
  res.json(l);
});
app.delete("/api/livreurs/:id", (req, res) => {
  db.livreurs = db.livreurs.filter(l => l.id !== req.params.id);
  res.json({ message: "Livreur " + req.params.id + " supprime" });
});
app.get("/api/livreurs/:id/livraisons", (req, res) => {
  const dlvs = db.livraisons.filter(d => d.livreur_id === req.params.id).map(d => ({
    ...d, commandes: db.commandes.find(c => c.id === d.commande_id) || null
  }));
  res.json(dlvs);
});

// ─── LIVRAISONS ──────────────────────────────────────────────────────────────
app.get("/api/livraisons", (req, res) => {
  const dlvs = db.livraisons.map(d => ({
    ...d,
    commandes: db.commandes.find(c => c.id === d.commande_id) || null,
    livreurs: db.livreurs.find(l => l.id === d.livreur_id) || null
  }));
  res.json(dlvs);
});
app.get("/api/livraisons/:id", (req, res) => {
  const d = db.livraisons.find(d => d.id === req.params.id);
  if (!d) return res.status(404).json({ message: "Livraison non trouvee" });
  res.json({
    ...d,
    commandes: db.commandes.find(c => c.id === d.commande_id) || null,
    livreurs: db.livreurs.find(l => l.id === d.livreur_id) || null
  });
});
app.post("/api/livraisons", (req, res) => {
  const { commande_id, livreur_id } = req.body;
  if (!commande_id || !livreur_id) return res.status(400).json({ message: "commande_id et livreur_id sont requis" });
  const d = { id: newId(), commande_id, livreur_id, statut: "en_cours", heure_depart: new Date().toISOString(), heure_arrivee: null };
  db.livraisons.push(d);
  const livreur = db.livreurs.find(l => l.id === livreur_id);
  if (livreur) livreur.statut = "en_livraison";
  res.status(201).json(d);
});
app.patch("/api/livraisons/:id/livrer", (req, res) => {
  const d = db.livraisons.find(d => d.id === req.params.id);
  if (!d) return res.status(500).json({ message: "Livraison non trouvee" });
  d.statut = "livree";
  d.heure_arrivee = new Date().toISOString();
  const livreur = db.livreurs.find(l => l.id === d.livreur_id);
  if (livreur) livreur.statut = "disponible";
  const commande = db.commandes.find(c => c.id === d.commande_id);
  if (commande) commande.statut = "livree";
  res.json(d);
});

// ─── STATISTIQUES ────────────────────────────────────────────────────────────
app.get("/api/stats/dashboard", (req, res) => {
  const chiffre_affaires = db.commandes.reduce((sum, c) => sum + (c.total || 0), 0);
  const commandes_par_statut = db.commandes.reduce((acc, c) => { acc[c.statut] = (acc[c.statut] || 0) + 1; return acc; }, {});
  const livreurs_disponibles = db.livreurs.filter(l => l.statut === "disponible").length;
  const produitsMap = {};
  db.commandes_produits.forEach(l => {
    const p = db.produits.find(p => p.id === l.produit_id);
    const nom = p?.nom || "Inconnu";
    produitsMap[nom] = (produitsMap[nom] || 0) + (l.quantite || 1);
  });
  const top_produits = Object.entries(produitsMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nom, quantite]) => ({ nom, quantite }));
  res.json({
    total_commandes: db.commandes.length,
    chiffre_affaires,
    commandes_par_statut,
    total_clients: db.clients.length,
    total_restaurants: db.restaurants.length,
    total_livreurs: db.livreurs.length,
    livreurs_disponibles,
    top_produits,
  });
});

// ─── Démarrage ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("=== SERVEUR MOCK (données en mémoire) ===");
  console.log("Serveur demarre sur http://localhost:" + PORT);
  console.log("Interface sur http://localhost:" + PORT + "/index.html");
  console.log(`Données: ${db.restaurants.length} restaurants, ${db.produits.length} produits, ${db.clients.length} clients, ${db.livreurs.length} livreurs`);
});
