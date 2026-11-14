import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ConteoPlayaRollosService } from './conteo-playa-rollos.service.js';

const adminGeneral = { sub: 1, email: 'a@t.com', rol: 'admin', aserradero: null } as any;
const adminAsignado = { sub: 2, email: 'b@t.com', rol: 'admin', aserradero: 'Norte' } as any;

function repoMock() {
  return {
    create: vi.fn((x) => x),
    save: vi.fn(async (x) => ({ id: 1, ...x })),
    createQueryBuilder: vi.fn(() => ({ leftJoinAndSelect: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), addOrderBy: vi.fn().mockReturnThis(), andWhere: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), take: vi.fn().mockReturnThis(), getManyAndCount: vi.fn(async () => [[], 0]) })),
    findOne: vi.fn(async () => null),
    remove: vi.fn(async () => ({})),
  } as any;
}

describe('ConteoPlayaRollosService', () => {
  it('calcula m3/tn por renglón (largo*lineal*alto) y factor default 1.0 (madera verde, calibrable)', async () => {
    const repo = repoMock();
    const itemRepo = repoMock();
    const ingresoRepo = { createQueryBuilder: vi.fn(() => ({ select: vi.fn().mockReturnThis(), addSelect: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), andWhere: vi.fn().mockReturnThis(), getRawOne: vi.fn(async () => ({ c: '0', m3: '0', tn: '0' })) })) } as any;
    const svc = new ConteoPlayaRollosService(repo, itemRepo, ingresoRepo);
    const res: any = await svc.create({
      aserradero: 'Norte', fechaCierre: '2026-11-07',
      // item1 usa factor default del cierre (1.0); item2 factor explícito 0.7
      items: [{ largoRollo: 2.5, metrosLineales: 25, alto: 1.6 }, { largoRollo: 3.15, metrosLineales: 20, alto: 1.6, factorTn: 0.7 }],
    } as any, adminGeneral);
    expect(res.totalM3).toBe(200.8);
    expect(res.totalTn).toBe(170.56); // 100*1.0 + 100.8*0.7
  });

  it('fuerza aserradero asignado y rechaza otro', async () => {
    const svc = new ConteoPlayaRollosService(repoMock(), repoMock(), repoMock());
    await expect(svc.create({ aserradero: 'Sur', fechaCierre: '2026-11-07', items: [{ largoRollo: 1, metrosLineales: 1, alto: 1 }] } as any, adminAsignado)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza no-admin', async () => {
    const svc = new ConteoPlayaRollosService(repoMock(), repoMock(), repoMock());
    await expect(svc.list({}, { rol: 'operario' } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
