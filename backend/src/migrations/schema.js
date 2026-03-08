const { query } = require('../config/database');

const migrations = [
  {
    name: '001_create_users',
    sql: `
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        avatar_url TEXT,
        is_online BOOLEAN DEFAULT FALSE,
        last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `
  },
  {
    name: '002_create_contacts',
    sql: `
      CREATE TABLE IF NOT EXISTS contacts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        contact_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, contact_id)
      );

      CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
      CREATE INDEX IF NOT EXISTS idx_contacts_contact_id ON contacts(contact_id);
    `
  },
  {
    name: '003_create_call_history',
    sql: `
      CREATE TABLE IF NOT EXISTS call_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        caller_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        callee_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        call_type VARCHAR(10) NOT NULL CHECK (call_type IN ('audio', 'video')),
        status VARCHAR(20) NOT NULL CHECK (status IN ('missed', 'completed', 'rejected', 'failed')),
        started_at TIMESTAMP WITH TIME ZONE,
        ended_at TIMESTAMP WITH TIME ZONE,
        duration_seconds INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_call_history_caller ON call_history(caller_id);
      CREATE INDEX IF NOT EXISTS idx_call_history_callee ON call_history(callee_id);
      CREATE INDEX IF NOT EXISTS idx_call_history_created ON call_history(created_at DESC);
    `
  },
  {
    name: '004_create_refresh_tokens',
    sql: `
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token_hash);
    `
  },
  {
    name: '005_create_migrations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  },
  {
    name: '006_add_is_notified_to_calls',
    sql: `
      ALTER TABLE call_history ADD COLUMN IF NOT EXISTS is_notified BOOLEAN DEFAULT FALSE;
    `
  }
];

async function runMigrations() {
  try {
    // Create migrations table first
    await query(`
      CREATE TABLE IF NOT EXISTS migrations(
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
`);

    for (const migration of migrations) {
      const existing = await query(
        'SELECT id FROM migrations WHERE name = $1',
        [migration.name]
      );

      if (existing.rows.length === 0) {
        console.log(`Running migration: ${migration.name} `);
        await query(migration.sql);
        await query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [migration.name]
        );
        console.log(`✓ Migration ${migration.name} completed`);
      } else {
        console.log(`⟳ Migration ${migration.name} already executed`);
      }
    }

    console.log('All migrations completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  }
}

module.exports = { runMigrations };
