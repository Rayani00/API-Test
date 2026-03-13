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
    admin: { signOut: jest.fn() },
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
      // Check if insert was called with correct data
      // Note: We'd need to spy on the builder returned by .from() to be precise, 
      // but checking .from() call is a good start.
      expect(mockSupabase.from).toHaveBeenCalledWith('clients');
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
  });

  describe('Produits Routes', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });
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
      mockSupabase.from.mockReturnValue(mockQueryBuilder(null)); // delete returns null data usually

      await request(app)
        .delete('/api/produits/10')
        .set('Authorization', 'Bearer token')
        .expect(200);
        
      expect(mockSupabase.from).toHaveBeenCalledWith('produits');
    });
  });
});