'use client';

import { ArrowRightLeft, Database, Wrench } from 'lucide-react';

import AddressTransferTool from '@/components/address-transfer-tool';
import CexFundingTool from '@/components/cex-funding-tool';
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

export default function ToolHub() {
  return (
    <Tabs defaultValue="cex-funding" className="min-h-screen gap-0 bg-background">
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1580px] flex-col gap-3 px-5 py-3 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-xl bg-foreground text-background">
                <Wrench className="size-4" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  BNB Smart Chain
                </p>
                <p className="text-sm font-semibold">链上中台工具</p>
              </div>
            </div>
            <Badge variant="outline" className="lg:hidden">
              BSC Mainnet
            </Badge>
          </div>

          <TabsList className="h-auto w-full bg-secondary/80 p-1 lg:w-auto">
            <TabsTrigger
              value="cex-funding"
              className="min-h-9 gap-2 px-3 sm:px-4"
            >
              <Database className="size-4" />
              CEX 首笔到账
            </TabsTrigger>
            <TabsTrigger
              value="address-transfer"
              className="min-h-9 gap-2 px-3 sm:px-4"
            >
              <ArrowRightLeft className="size-4" />
              地址转账检查
            </TabsTrigger>
          </TabsList>

          <Badge variant="outline" className="hidden lg:inline-flex">
            BSC Mainnet
          </Badge>
        </div>
      </header>

      <TabsContent value="cex-funding" className="mt-0">
        <CexFundingTool />
      </TabsContent>
      <TabsContent value="address-transfer" className="mt-0">
        <AddressTransferTool />
      </TabsContent>
    </Tabs>
  );
}
