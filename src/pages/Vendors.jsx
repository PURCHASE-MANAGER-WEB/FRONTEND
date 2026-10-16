import React from 'react';
import VendorManager from '../components/VendorManager';

// Vendors (suppliers) master — purchase_suppliers where type = Supplier.
export default function Vendors() {
  return <VendorManager kind="Supplier" />;
}
