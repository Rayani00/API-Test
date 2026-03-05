const express = require("express");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const { createClient } = require("@supabase/supabase-js");

// ─── Initialisation ───────────────────────────────────────────────────────────
const app = express();
const PORT = 3000;

app.use(express.json());

// ─── Connexion Supabase ───────────────────────────────────────────────────────
const SUPABASE_URL = "https://yftaggyurqpyyuxhsuhf.supabase.co";
const SUPABASE_KEY = "sb_publishable_03rWk-XyJY5N-FLT8UIrrA_k8sAOSDj";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Swagger ──────────────────────────────────────────────────────────────────
const swaggerDocument = YAML.load("./swagger.yaml");
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/utilisateurs → retourne tous les utilisateurs depuis Supabase
app.get("/api/utilisateurs", async (req, res) => {
  const { data, error } = await supabase
    .from("utilisateurs")
    .select("*");

  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

// GET /api/utilisateurs/search → recherche par nom
app.get("/api/utilisateurs/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ message: "Paramètre 'q' requis" });

  const { data, error } = await supabase
    .from("utilisateurs")
    .select("*")
    .ilike("nom", `%${q}%`);

  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

// GET /api/utilisateurs/:id → retourne un utilisateur par son ID
app.get("/api/utilisateurs/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  const { data, error } = await supabase
    .from("utilisateurs")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return res.status(404).json({ message: "Utilisateur non trouvé" });
  res.json(data);
});

// POST /api/utilisateurs → crée un nouvel utilisateur dans Supabase
app.post("/api/utilisateurs", async (req, res) => {
  const { nom, prenom, email } = req.body;

  if (!nom || !prenom || !email) {
    return res.status(400).json({ message: "nom, prenom et email sont requis" });
  }

  const { data, error } = await supabase
    .from("utilisateurs")
    .insert([{ nom, prenom, email }])
    .select()
    .single();

  if (error) return res.status(500).json({ message: error.message });
  res.status(201).json(data);
});

// PUT /api/utilisateurs/:id → met à jour un utilisateur
app.put("/api/utilisateurs/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { nom, prenom, email } = req.body;

  const { data, error } = await supabase
    .from("utilisateurs")
    .update({ nom, prenom, email })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

// DELETE /api/utilisateurs/:id → supprime un utilisateur
app.delete("/api/utilisateurs/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  const { error } = await supabase
    .from("utilisateurs")
    .delete()
    .eq("id", id);

  if (error) return res.status(500).json({ message: error.message });
  res.json({ message: `Utilisateur ${id} supprimé avec succès` });
});

// POST /api/admin/create-table → crée une table via RPC (nécessite une fonction SQL)
app.post("/api/admin/create-table", async (req, res) => {
  const { tableName } = req.body;
  if (!tableName) return res.status(400).json({ message: "tableName requis" });

  // Note: Nécessite une fonction PostgreSQL 'create_table' dans Supabase
  // SQL à exécuter dans Supabase :
  // CREATE OR REPLACE FUNCTION create_table(table_name text) RETURNS void AS $$
  // BEGIN EXECUTE format('CREATE TABLE %I (id serial PRIMARY KEY, created_at timestamp default now())', table_name); END;
  // $$ LANGUAGE plpgsql SECURITY DEFINER;

  const { error } = await supabase.rpc("create_table", { table_name: tableName });

  if (error) return res.status(500).json({ message: error.message });
  res.json({ message: `Table ${tableName} créée avec succès` });
});

// ─── Démarrage du serveur ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📖 Swagger disponible sur http://localhost:${PORT}/api-docs`);
});