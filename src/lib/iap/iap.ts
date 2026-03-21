/**
 * In-App Purchase (IAP) Integration
 * Handles iOS App Store purchases using react-native-iap
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Alert,
} from 'react-native';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
  getAvailablePurchases,
  Product,
  Purchase,
  ErrorCode,
} from 'react-native-iap';
import { IapSku, ALL_SKUS, IAP_CATALOG, EntitlementType } from './catalog';

let isConnectionInitialized = false;

/**
 * Initialize IAP connection once per app lifecycle
 */
export async function initIapConnection() {
  if (isConnectionInitialized) return;
  try {
    await initConnection();
    isConnectionInitialized = true;
    console.log('[IAP] Connection initialized');
  } catch (error: any) {
    console.warn('[IAP] Init error:', error?.message || error);
  }
}

export type IapProductData = Product & {
  sku: IapSku;
  catalogTitle?: string;
  catalogDescription?: string;
};

/**
 * Hook to fetch and manage products from App Store
 */
export function useIapProducts(skus: IapSku[] = ALL_SKUS) {
  const [products, setProducts] = useState<IapProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        setError(null);
        if (Platform.OS !== 'ios') {
          setProducts([]);
          setLoading(false);
          return;
        }
        const fetched = await fetchProducts({ skus });
        if (!fetched) {
          setProducts([]);
          setLoading(false);
          return;
        }
        const enriched: IapProductData[] = (fetched as Product[]).map((product) => {
          const sku = product.id as IapSku;
          const catalogData = IAP_CATALOG[sku];
          return {
            ...product,
            sku,
            catalogTitle: catalogData?.title,
            catalogDescription: catalogData?.description,
          };
        });
        setProducts(enriched.sort((a, b) => skus.indexOf(a.sku) - skus.indexOf(b.sku)));
      } catch (err: any) {
        const message = err?.message || 'Failed to fetch products';
        setError(message);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);
  return { products, loading, error };
}

export interface PurchaseResult {
  success: boolean;
  sku?: IapSku;
  transactionId?: string;
  receipt?: string;
  error?: string;
}

/**
 * Hook to handle purchase flow
 */
export function usePurchase() {
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const purchaseSku = useCallback(
    async (sku: IapSku): Promise<PurchaseResult> => {
      try {
        setPurchasing(true);
        setError(null);
        if (Platform.OS !== 'ios') {
          const msg = 'IAP only available on iOS';
          setError(msg);
          return { success: false, error: msg };
        }
        await requestPurchase({ request: { apple: { sku } }, type: 'in-app' });
        return { success: true, sku };
      } catch (err: any) {
        const message = err?.message || 'Purchase failed';
        setError(message);
        if (err?.code === ErrorCode.UserCancelled) {
          return { success: false, error: 'Purchase cancelled' };
        }
        return { success: false, error: message };
      } finally {
        setPurchasing(false);
      }
    },
    []
  );
  return { purchaseSku, purchasing, error };
}

/**
 * Listen for purchase updates
 * Set up globally, call this once in your app's root component
 */
export function setupPurchaseListener(
  onPurchaseSuccess: (purchase: Purchase & { sku: IapSku }) => void,
  onPurchaseError: (error: any) => void
) {
  if (Platform.OS !== 'ios') return;
  let subscription: any;
  let errorSubscription: any;
  try {
    subscription = purchaseUpdatedListener(async (purchase: Purchase) => {
      const sku = purchase.productId as IapSku;
      try {
        await finishTransaction({ purchase, isConsumable: true });
        onPurchaseSuccess({ ...purchase, sku: purchase.productId as IapSku });
      } catch (err: any) {
        onPurchaseError(err);
      }
    });
    errorSubscription = purchaseErrorListener((error: any) => {
      onPurchaseError(error);
    });
    return () => {
      subscription?.remove?.();
      errorSubscription?.remove?.();
    };
  } catch (error: any) {
    console.error('[IAP] Setup listener error:', error?.message);
  }
}

/**
 * Get purchased items (for restore purchases)
 */
export async function getOwnedPurchases() {
  if (Platform.OS !== 'ios') return [];
  try {
    const purchases = await getAvailablePurchases();
    return purchases;
  } catch (error: any) {
    return [];
  }
}
