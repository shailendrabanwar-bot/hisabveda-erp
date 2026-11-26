import React from 'react';
import { InventoryModule } from '../Inventory/InventoryModule';
import { AppData, Godown, ItemBatch, ItemMaster, StockTransfer, UserRole } from '../../types';
import { RolePermissions } from '../../utils/rbac';

export interface ItemMasterListProps {
  data: AppData;
  isHindi: boolean;
  onAddItem: (item: ItemMaster) => void;
  onUpdateItem?: (item: ItemMaster) => void;
  onDeleteItem: (id: string) => void;
  onStockAdjustment?: (itemId: string, newQuantity: number, reason: string, notes?: string, godownId?: string) => void;
  onBatchStockAdjustment?: (adjustments: Array<{ itemId: string; newQuantity: number; reason: string; notes?: string; godownId?: string }>) => void;
  onSaveGodowns?: (godowns: Godown[]) => void;
  onSaveBatch?: (batch: ItemBatch) => void;
  onDeleteBatch?: (batchId: string) => void;
  onWriteOffBatch?: (batchId: string) => void;
  onExecuteStockTransfer?: (transfer: StockTransfer) => { ok: boolean; error?: string };
  onOpenBarcodePos?: () => void;
  onNavigateToPurchases?: () => void;
  onNavigateToSales?: () => void;
  initialSearchQuery?: string;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export const ItemMasterList: React.FC<ItemMasterListProps> = (props) => {
  return <InventoryModule {...props} />;
};

