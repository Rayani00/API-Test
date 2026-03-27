const request = require('supertest');
const { createClient } = require('@supabase/supabase-js');
const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');

// Mocks configuration
jest.mock('@supabase/supabase-js');
jest.mock('yamljs');
jest.mock('swagger-ui-express', () => ({
  serve: [],
  setup: jest.fn().mockReturnValue((req, res, next) => next()),
}));

// Helper to mock Supabase Query Builder
const mockQueryBuilder = (data, error = null) => {
  const builder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    // Make the builder thenable so it works with await
    then: (resolve) => resolve({ data, error }),
  };
  return builder;
};

// Main Supabase mock object
const mockSupabase = {
  auth: {
    getUser: jest.fn(),
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    resend: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    updateUser: jest.fn(),
    admin: {
      signOut: jest.fn(),
      deleteUser: jest.fn(),
      updateUserById: jest.fn(),
    },
  },
  from: jest.fn(),
};

// Setup mock implementations before requiring the server
createClient.mockReturnValue(mockSupabase);
YAML.load.mockReturnValue({});

// Import the app after setting up mocks
const app = require('./server');

describe('API Server Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication Middleware', () => {
    it('should allow access to public auth routes without token', async () => {
      // Mock signUp response for this test
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: { id: '123', email: 'test@test.com' } },
        error: null,
      });

      await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@test.com', password: 'password' })
        .expect(201);
    });

    it('should reject access to protected routes without token', async () => {
      await request(app).get('/api/clients').expect(401);
    });

    it('should reject access with invalid token', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      await request(app)
        .get('/api/clients')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should allow access with valid token', async () => {
      // Mock successful auth
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });
      // Mock database response
      mockSupabase.from.mockReturnValue(mockQueryBuilder([]));

      await request(app)
        .get('/api/clients')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);
    });
  });

  describe('Auth Routes', () => {
    it('POST /api/auth/login returns token on success', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: {
          session: { access_token: 'fake-jwt', expires_in: 3600 },
          user: { id: '1', email: 'a@b.com' },
        },
        error: null,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'a@b.com', password: 'pass' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('access_token', 'fake-jwt');
    });

    it('POST /api/auth/login returns 401 on error', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: {},
        error: { message: 'Invalid login' },
      });

      await request(app)
        .post('/api/auth/login')
        .send({ email: 'a@b.com', password: 'wrong' })
        .expect(401);
    });

    // SMTP desactive - test mis en attente
    it.skip('POST /api/auth/resend-confirmation should call Supabase resend', async () => {
      mockSupabase.auth.resend.mockResolvedValue({ data: {}, error: null });

      const res = await request(app)
        .post('/api/auth/resend-confirmation')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(200);
      expect(mockSupabase.auth.resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'test@test.com',
      });
    });

    // SMTP desactive - test mis en attente
    it.skip('POST /api/auth/reset-password should call Supabase resetPasswordForEmail', async () => {
      mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(200);
      expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('test@test.com');
    });

    // SMTP desactive - test mis en attente
    it.skip('PUT /api/auth/update-email should update email for logged in user', async () => {
      // Mock auth middleware allowing request via token
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });
      // Mock update user call
      mockSupabase.auth.updateUser.mockResolvedValue({ data: {}, error: null });

      const res = await request(app)
        .put('/api/auth/update-email')
        .set('Authorization', 'Bearer valid-token')
        .send({ email: 'new@test.com' });

      expect(res.status).toBe(200);
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ email: 'new@test.com' });
    });

    it('DELETE /api/auth/delete-account should delete logged in user', async () => {
      // Mock auth middleware
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });
      // Mock delete user call
      mockSupabase.auth.admin.deleteUser.mockResolvedValue({ data: {}, error: null });

      const res = await request(app)
        .delete('/api/auth/delete-account')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockSupabase.auth.admin.deleteUser).toHaveBeenCalledWith('user-123');
    });

    it('PUT /api/auth/users/:id/password should update password by user ID', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-user' } },
        error: null,
      });
      mockSupabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

      const res = await request(app)
        .put('/api/auth/users/target-user-uuid/password')
        .set('Authorization', 'Bearer valid-token')
        .send({ password: 'NouveauMotDePasse123' });

      expect(res.status).toBe(200);
      expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledWith(
        'target-user-uuid',
        { password: 'NouveauMotDePasse123' }
      );
    });

    it('PUT /api/auth/users/:id/password returns 400 if password too short', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-user' } },
        error: null,
      });

      const res = await request(app)
        .put('/api/auth/users/target-user-uuid/password')
        .set('Authorization', 'Bearer valid-token')
        .send({ password: '123' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/6 caracteres/);
    });

    it('POST /api/auth/register returns 400 if fields missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@test.com' }); // missing password

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/requis/);
    });

    it('GET /api/auth/me returns current user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'me@test.com' } },
        error: null,
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.user).toHaveProperty('id', 'user-123');
    });

    it('POST /api/auth/logout returns 200 on success', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });
      mockSupabase.auth.admin.signOut.mockResolvedValue({ error: null });

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Deconnecte/);
    });

    it('POST /api/auth/logout returns 500 if signOut fails', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });
      mockSupabase.auth.admin.signOut.mockResolvedValue({ error: { message: 'signOut failed' } });

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(500);
    });
  });

  describe('Clients Routes', () => {
    // Setup valid auth for all tests in this block
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });
    });

    it('GET /api/clients returns list of clients', async () => {
      const mockData = [{ id: 1, nom: 'Doe' }];
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .get('/api/clients')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
      expect(mockSupabase.from).toHaveBeenCalledWith('clients');
    });

    it('POST /api/clients creates a client', async () => {
      const newClient = { nom: 'Doe', prenom: 'John', email: 'j@d.com' };
      mockSupabase.from.mockReturnValue(mockQueryBuilder({ id: 1, ...newClient }));

      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', 'Bearer token')
        .send(newClient);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(mockSupabase.from).toHaveBeenCalledWith('clients');
    });

    it('POST /api/clients returns 400 if required fields missing', async () => {
      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', 'Bearer token')
        .send({ nom: 'Doe' }); // missing prenom and email

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/requis/);
    });

    it('GET /api/clients/:id returns client', async () => {
      const mockClient = { id: 1, nom: 'Doe', prenom: 'John', email: 'j@d.com' };
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockClient));

      const res = await request(app)
        .get('/api/clients/1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 1);
    });

    it('GET /api/clients/:id returns 404 if not found', async () => {
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null, { message: 'Not found', code: 'PGRST116' }));

      const res = await request(app)
        .get('/api/clients/999')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(404);
    });

    it('PUT /api/clients/:id updates a client', async () => {
      const updated = { id: 1, nom: 'Dupont', prenom: 'Jean', email: 'j@d.com' };
      mockSupabase.from.mockReturnValue(mockQueryBuilder(updated));

      const res = await request(app)
        .put('/api/clients/1')
        .set('Authorization', 'Bearer token')
        .send({ nom: 'Dupont', prenom: 'Jean', email: 'j@d.com' });

      expect(res.status).toBe(200);
      expect(res.body.nom).toBe('Dupont');
    });

    it('PUT /api/clients/:id returns 404 if not found', async () => {
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null, { message: 'Not found', code: 'PGRST116' }));

      const res = await request(app)
        .put('/api/clients/999')
        .set('Authorization', 'Bearer token')
        .send({ nom: 'X' });

      expect(res.status).toBe(404);
    });

    it('DELETE /api/clients/:id deletes a client', async () => {
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null));

      const res = await request(app)
        .delete('/api/clients/1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/supprime/);
    });

    it('GET /api/clients/:id/commandes returns order history for client', async () => {
      const mockData = [{ id: 1, total: 35, client_id: 1 }];
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .get('/api/clients/1/commandes')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
      expect(mockSupabase.from).toHaveBeenCalledWith('commandes');
    });
  });

  describe('Restaurants Routes', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });
    });

    it('GET /api/restaurants returns list of restaurants', async () => {
      const mockData = [{ id: 1, nom: 'Burger House', cuisine: 'Burgers' }];
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .get('/api/restaurants')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
    });

    it('GET /api/restaurants/:id returns restaurant', async () => {
      const mockData = { id: 1, nom: 'Burger House', cuisine: 'Burgers' };
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .get('/api/restaurants/1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 1);
    });

    it('GET /api/restaurants/:id returns 404 if not found', async () => {
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null, { message: 'Not found' }));

      const res = await request(app)
        .get('/api/restaurants/999')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(404);
    });

    it('GET /api/restaurants/:id/produits returns products for restaurant', async () => {
      const mockData = [{ id: 1, nom: 'Burger', prix: 10 }];
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .get('/api/restaurants/1/produits')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
    });

    it('POST /api/restaurants creates a restaurant', async () => {
      const newResto = { nom: 'Pizza House', cuisine: 'Pizza' };
      mockSupabase.from.mockReturnValue(mockQueryBuilder({ id: 2, ...newResto }));

      const res = await request(app)
        .post('/api/restaurants')
        .set('Authorization', 'Bearer token')
        .send(newResto);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('POST /api/restaurants returns 400 if required fields missing', async () => {
      const res = await request(app)
        .post('/api/restaurants')
        .set('Authorization', 'Bearer token')
        .send({ nom: 'Pizza House' }); // missing cuisine

      expect(res.status).toBe(400);
    });

    it('PUT /api/restaurants/:id updates a restaurant', async () => {
      const updated = { id: 1, nom: 'Burger Palace', cuisine: 'Burgers' };
      mockSupabase.from.mockReturnValue(mockQueryBuilder(updated));

      const res = await request(app)
        .put('/api/restaurants/1')
        .set('Authorization', 'Bearer token')
        .send({ nom: 'Burger Palace', cuisine: 'Burgers' });

      expect(res.status).toBe(200);
      expect(res.body.nom).toBe('Burger Palace');
    });

    it('PUT /api/restaurants/:id returns 404 if not found', async () => {
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null, { message: 'Not found', code: 'PGRST116' }));

      const res = await request(app)
        .put('/api/restaurants/999')
        .set('Authorization', 'Bearer token')
        .send({ nom: 'X' });

      expect(res.status).toBe(404);
    });

    it('DELETE /api/restaurants/:id deletes a restaurant', async () => {
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null));

      const res = await request(app)
        .delete('/api/restaurants/1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/supprime/);
    });

    it('GET /api/restaurants/:id/commandes returns orders for restaurant', async () => {
      const mockData = [{ id: 1, total: 35, restaurant_id: 1 }];
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .get('/api/restaurants/1/commandes')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
      expect(mockSupabase.from).toHaveBeenCalledWith('commandes');
    });
  });

  describe('Commandes Routes (Business Logic)', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });
    });

    it('POST /api/commandes calculates total correctly', async () => {
      const produits = [
        { produit_id: 1, quantite: 2, prix_unitaire: 10 }, // 20
        { produit_id: 2, quantite: 1, prix_unitaire: 15 }, // 15
      ]; // Total should be 35

      const mockOrder = { id: 100, total: 35 };
      
      // We need specific behavior for 'commandes' insert vs 'commandes_produits' insert
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'commandes') {
          // Mock the insert response for the order
          const builder = mockQueryBuilder(mockOrder);
          // Spy on insert to verify total calculation
          builder.insert = jest.fn().mockImplementation((payload) => {
            // Verify the calculated total passed to DB
            if (payload[0].total !== 35) throw new Error(`Wrong total: ${payload[0].total}`);
            return builder; // Return builder for chaining
          });
          return builder;
        }
        if (table === 'commandes_produits') {
          return mockQueryBuilder({});
        }
        return mockQueryBuilder({});
      });

      const res = await request(app)
        .post('/api/commandes')
        .set('Authorization', 'Bearer token')
        .send({
          client_id: 1,
          restaurant_id: 1,
          adresse_livraison: 'Home',
          produits,
        });

      expect(res.status).toBe(201);
      expect(res.body.total).toBe(35);
    });

    it('POST /api/commandes returns 400 if required fields missing', async () => {
      const res = await request(app)
        .post('/api/commandes')
        .set('Authorization', 'Bearer token')
        .send({ client_id: 1 }); // missing restaurant_id, adresse_livraison, produits

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/requis/);
    });

    it('GET /api/commandes returns list of orders', async () => {
      const mockData = [{ id: 1, total: 35 }];
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .get('/api/commandes')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
    });

    it('GET /api/commandes/:id returns order', async () => {
      const mockData = { id: 1, total: 35 };
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .get('/api/commandes/1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 1);
    });

    it('GET /api/commandes/:id returns 404 if not found', async () => {
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null, { message: 'Not found' }));

      const res = await request(app)
        .get('/api/commandes/999')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(404);
    });

    it('PATCH /api/commandes/:id/statut updates status', async () => {
      const mockData = { id: 1, statut: 'en_preparation' };
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .patch('/api/commandes/1/statut')
        .set('Authorization', 'Bearer token')
        .send({ statut: 'en_preparation' });

      expect(res.status).toBe(200);
      expect(res.body.statut).toBe('en_preparation');
    });

    it('PATCH /api/commandes/:id/statut returns 400 for invalid status', async () => {
      const res = await request(app)
        .patch('/api/commandes/1/statut')
        .set('Authorization', 'Bearer token')
        .send({ statut: 'mauvais_statut' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Statut invalide/);
    });

    it('DELETE /api/commandes/:id deletes an order and its lines', async () => {
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null));

      const res = await request(app)
        .delete('/api/commandes/1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/supprimee/);
      expect(mockSupabase.from).toHaveBeenCalledWith('commandes_produits');
      expect(mockSupabase.from).toHaveBeenCalledWith('commandes');
    });
  });

  describe('Produits Routes', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });
    });

    it('GET /api/produits/search returns matching products', async () => {
      const mockData = [{ id: 1, nom: 'Burger Classic', prix: 10 }];
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .get('/api/produits/search?q=Burger')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
    });

    it('GET /api/produits/search returns 400 if q missing', async () => {
      const res = await request(app)
        .get('/api/produits/search')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(400);
    });

    it('GET /api/produits/:id returns 404 if not found', async () => {
      // Mock single() returning error for 404
      const builder = mockQueryBuilder(null, { message: 'Not found' });
      mockSupabase.from.mockReturnValue(builder);

      await request(app)
        .get('/api/produits/999')
        .set('Authorization', 'Bearer token')
        .expect(404);
    });

    it('DELETE /api/produits/:id deletes product', async () => {
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null));

      await request(app)
        .delete('/api/produits/10')
        .set('Authorization', 'Bearer token')
        .expect(200);

      expect(mockSupabase.from).toHaveBeenCalledWith('produits');
    });

    it('GET /api/produits returns list of products', async () => {
      const mockData = [{ id: 1, nom: 'Burger', prix: 10 }];
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .get('/api/produits')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
    });

    it('POST /api/produits creates a product', async () => {
      const newProduit = { restaurant_id: 1, nom: 'Burger', prix: 10 };
      mockSupabase.from.mockReturnValue(mockQueryBuilder({ id: 1, ...newProduit }));

      const res = await request(app)
        .post('/api/produits')
        .set('Authorization', 'Bearer token')
        .send(newProduit);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('POST /api/produits returns 400 if required fields missing', async () => {
      const res = await request(app)
        .post('/api/produits')
        .set('Authorization', 'Bearer token')
        .send({ nom: 'Burger' }); // missing restaurant_id and prix

      expect(res.status).toBe(400);
    });

    it('PUT /api/produits/:id updates a product', async () => {
      const updated = { id: 1, nom: 'Super Burger', prix: 12 };
      mockSupabase.from.mockReturnValue(mockQueryBuilder(updated));

      const res = await request(app)
        .put('/api/produits/1')
        .set('Authorization', 'Bearer token')
        .send({ nom: 'Super Burger', prix: 12 });

      expect(res.status).toBe(200);
      expect(res.body.nom).toBe('Super Burger');
    });

    it('PUT /api/produits/:id returns 404 if not found', async () => {
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null, { message: 'Not found', code: 'PGRST116' }));

      const res = await request(app)
        .put('/api/produits/999')
        .set('Authorization', 'Bearer token')
        .send({ nom: 'X' });

      expect(res.status).toBe(404);
    });
  });

  describe('Livreurs Routes', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });
    });

    it('GET /api/livreurs returns list of drivers', async () => {
      const mockData = [{ id: 1, nom: 'Martin', prenom: 'Paul' }];
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .get('/api/livreurs')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
    });

    it('POST /api/livreurs creates a driver', async () => {
      const newLivreur = { nom: 'Martin', prenom: 'Paul', telephone: '0612345678' };
      mockSupabase.from.mockReturnValue(mockQueryBuilder({ id: 1, ...newLivreur }));

      const res = await request(app)
        .post('/api/livreurs')
        .set('Authorization', 'Bearer token')
        .send(newLivreur);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('POST /api/livreurs returns 400 if required fields missing', async () => {
      const res = await request(app)
        .post('/api/livreurs')
        .set('Authorization', 'Bearer token')
        .send({ nom: 'Martin' }); // missing prenom and telephone

      expect(res.status).toBe(400);
    });

    it('GET /api/livreurs/:id returns a driver', async () => {
      const mockData = { id: 1, nom: 'Martin', prenom: 'Paul' };
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .get('/api/livreurs/1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 1);
    });

    it('GET /api/livreurs/:id returns 404 if not found', async () => {
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null, { message: 'Not found' }));

      const res = await request(app)
        .get('/api/livreurs/999')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(404);
    });

    it('PUT /api/livreurs/:id updates a driver', async () => {
      const updated = { id: 1, nom: 'Martin', prenom: 'Pierre', telephone: '0612345678' };
      mockSupabase.from.mockReturnValue(mockQueryBuilder(updated));

      const res = await request(app)
        .put('/api/livreurs/1')
        .set('Authorization', 'Bearer token')
        .send({ nom: 'Martin', prenom: 'Pierre', telephone: '0612345678' });

      expect(res.status).toBe(200);
      expect(res.body.prenom).toBe('Pierre');
    });

    it('PUT /api/livreurs/:id returns 404 if not found', async () => {
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null, { message: 'Not found', code: 'PGRST116' }));

      const res = await request(app)
        .put('/api/livreurs/999')
        .set('Authorization', 'Bearer token')
        .send({ nom: 'X' });

      expect(res.status).toBe(404);
    });

    it('DELETE /api/livreurs/:id deletes a driver', async () => {
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null));

      const res = await request(app)
        .delete('/api/livreurs/1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/supprime/);
    });

    it('GET /api/livreurs/:id/livraisons returns deliveries for driver', async () => {
      const mockData = [{ id: 1, livreur_id: 1, statut: 'livree' }];
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .get('/api/livreurs/1/livraisons')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
      expect(mockSupabase.from).toHaveBeenCalledWith('livraisons');
    });
  });

  describe('Livraisons Routes', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });
    });

    it('GET /api/livraisons/:id returns a delivery', async () => {
      const mockData = { id: 1, statut: 'en_cours', livreur_id: 5 };
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .get('/api/livraisons/1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 1);
    });

    it('GET /api/livraisons/:id returns 404 if not found', async () => {
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null, { message: 'Not found' }));

      const res = await request(app)
        .get('/api/livraisons/999')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(404);
    });

    it('GET /api/livraisons returns list of deliveries', async () => {
      const mockData = [{ id: 1, statut: 'en_cours' }];
      mockSupabase.from.mockReturnValue(mockQueryBuilder(mockData));

      const res = await request(app)
        .get('/api/livraisons')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
    });

    it('POST /api/livraisons assigns delivery to driver', async () => {
      const mockLivraison = { id: 1, commande_id: 10, livreur_id: 5 };
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'livraisons') return mockQueryBuilder(mockLivraison);
        return mockQueryBuilder(null); // livreurs update side-effect
      });

      const res = await request(app)
        .post('/api/livraisons')
        .set('Authorization', 'Bearer token')
        .send({ commande_id: 10, livreur_id: 5 });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', 1);
    });

    it('POST /api/livraisons returns 400 if required fields missing', async () => {
      const res = await request(app)
        .post('/api/livraisons')
        .set('Authorization', 'Bearer token')
        .send({ commande_id: 10 }); // missing livreur_id

      expect(res.status).toBe(400);
    });

    it('PATCH /api/livraisons/:id/livrer marks delivery as completed', async () => {
      const mockLivraison = { id: 1, statut: 'livree', livreur_id: 5, commande_id: 10 };
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'livraisons') return mockQueryBuilder(mockLivraison);
        return mockQueryBuilder(null); // side-effect updates
      });

      const res = await request(app)
        .patch('/api/livraisons/1/livrer')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.statut).toBe('livree');
    });

    it('PATCH /api/livraisons/:id/livrer returns 500 if livraison not found', async () => {
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null, { message: 'Not found' }));

      const res = await request(app)
        .patch('/api/livraisons/999/livrer')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(500);
    });
  });

  describe('Stats Routes', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });
    });

    it('GET /api/stats/dashboard returns dashboard statistics', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'commandes') return mockQueryBuilder([
          { id: 1, total: 35, statut: 'livree', created_at: '2025-01-01' },
          { id: 2, total: 20, statut: 'en_attente', created_at: '2025-01-02' },
        ]);
        if (table === 'clients') return mockQueryBuilder([{ id: 1 }, { id: 2 }]);
        if (table === 'restaurants') return mockQueryBuilder([{ id: 1 }]);
        if (table === 'livreurs') return mockQueryBuilder([
          { id: 1, statut: 'disponible' },
          { id: 2, statut: 'en_livraison' },
        ]);
        if (table === 'commandes_produits') return mockQueryBuilder([
          { produit_id: 1, quantite: 3, produits: { nom: 'Burger' } },
          { produit_id: 2, quantite: 1, produits: { nom: 'Pizza' } },
        ]);
        return mockQueryBuilder([]);
      });

      const res = await request(app)
        .get('/api/stats/dashboard')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total_commandes', 2);
      expect(res.body).toHaveProperty('chiffre_affaires', 55);
      expect(res.body).toHaveProperty('total_clients', 2);
      expect(res.body).toHaveProperty('total_restaurants', 1);
      expect(res.body).toHaveProperty('total_livreurs', 2);
      expect(res.body).toHaveProperty('livreurs_disponibles', 1);
      expect(res.body.commandes_par_statut).toEqual({ livree: 1, en_attente: 1 });
      expect(res.body.top_produits).toEqual([
        { nom: 'Burger', quantite: 3 },
        { nom: 'Pizza', quantite: 1 },
      ]);
    });
  });
});