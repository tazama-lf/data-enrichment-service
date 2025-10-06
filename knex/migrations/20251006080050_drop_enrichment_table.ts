import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('enrichment');
}

export async function down(): Promise<void> {}
