// Tablero de Control Gerencial con los 6 KPIs del PRD
// Ruta: /tablero-gerencial

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { TableroGerencialClient } from '@/components/dashboard/tablero-gerencial-client';

export const metadata: Metadata = {
  title: 'Tablero de Control Gerencial',
};

export default function TableroGerencialPage() {
  return (
    <Suspense fallback={<div className="flex h-[600px] items-center justify-center">Cargando tablero...</div>}>
      <TableroGerencialClient />
    </Suspense>
  );
}