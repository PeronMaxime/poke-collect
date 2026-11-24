import { describe, expect, it } from 'vitest';
import { createGuildInputSchema } from './guilds';
import { nameRefusal } from './names';
import { trainerNameSchema } from './profile';

describe('noms de dresseur et de guilde', () => {
  it('acceptent les noms ordinaires, dans un seul alphabet', () => {
    for (const name of [
      'Sacha',
      'Ondine_42',
      'Pierre-Paul',
      'Émilie',
      'Саша',
      'さとし',
      'Team Rocket',
    ]) {
      expect(nameRefusal(name), name).toBeNull();
    }
  });

  it('refusent les noms qui imitent un compte officiel, même déguisés', () => {
    for (const name of [
      'Admin',
      'SuperAdmin',
      '4dm1n',
      'ＡＤＭＩＮ',
      'Modérateur',
      'Modo',
      'Dexpedition',
      'Le Staff',
      'Système',
    ]) {
      expect(nameRefusal(name), name).toBe('Ce nom est réservé');
    }
    // « Modo » n'est refusé que seul : il apparaît dans d'autres noms.
    expect(nameRefusal('Modoki')).toBeNull();
  });

  it('refusent les lettres de deux alphabets mêlées', () => {
    // A cyrillique (U+0410) devant « dmin » latin, o grec dans « Sacha ».
    expect(nameRefusal('Аdmin')).not.toBeNull();
    expect(nameRefusal('Sachο')).toMatch(/Un seul alphabet/);
  });

  it('sont vérifiés par les schémas de création', () => {
    expect(trainerNameSchema.safeParse('Sacha').success).toBe(true);
    const trainer = trainerNameSchema.safeParse(' Admin ');
    expect(trainer.success).toBe(false);
    expect(trainer.error?.issues[0]?.message).toBe('Ce nom est réservé');
    const guild = createGuildInputSchema.safeParse({
      name: 'Les Modérateurs',
      description: '',
      joinMode: 'open',
    });
    expect(guild.success).toBe(false);
  });
});
