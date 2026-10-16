import React from 'react';
import VendorManager from '../components/VendorManager';

// Fabricators master — purchase_suppliers where type = Fabricator.
export default function Fabricators() {
  return <VendorManager kind="Fabricator" />;
}
