import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AprendizajePaquete } from './entities/aprendizaje-paquete.entity.js';

@Injectable()
export class AprendizajePaquetesService {
  constructor(
    @InjectRepository(AprendizajePaquete)
    private readonly repo: Repository<AprendizajePaquete>,
  ) {}

  async suggest(data: { espesor: number; ancho: number; largo: number; especie?: string }) {
    const qb = this.repo.createQueryBuilder('ap')
      .where('ap.espesor = :espesor', { espesor: data.espesor })
      .andWhere('ap.ancho = :ancho', { ancho: data.ancho })
      .andWhere('ap.largo = :largo', { largo: data.largo });

    if (data.especie) qb.andWhere('ap.especie = :especie', { especie: data.especie });

    const found = await qb.getMany();
    if (found.length) {
      found.forEach(f => { f.vecesUsado += 1; });
      await this.repo.save(found);
      return found[0];
    }
    return null;
  }

  async learn(data: { espesor: number; ancho: number; largo: number; especie?: string; piezasPorPaquete: number; separadores: any[]; tacos: any[] }) {
    const exists = await this.repo.findOneBy({
      espesor: data.espesor,
      ancho: data.ancho,
      largo: data.largo,
      ...(data.especie ? { especie: data.especie } : {}),
    });
    if (exists) {
      exists.piezasPorPaquete = data.piezasPorPaquete;
      exists.separadores = data.separadores;
      exists.tacos = data.tacos;
      exists.vecesUsado += 1;
      return this.repo.save(exists);
    }
    const entity = this.repo.create({
      espesor: data.espesor,
      ancho: data.ancho,
      largo: data.largo,
      especie: data.especie,
      piezasPorPaquete: data.piezasPorPaquete,
      separadores: data.separadores,
      tacos: data.tacos,
      vecesUsado: 1,
    });
    return this.repo.save(entity);
  }
}