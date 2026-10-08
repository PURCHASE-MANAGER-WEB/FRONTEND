import React, { useState, useEffect } from 'react';
import { invoicesApi } from '../../api/client';
import { usePurchaseData } from '../../context/PurchaseData';
import { inr } from '../../utils/procurement';

export default function AccountsInvoices() {
  const [invoices, setInvoices] = useState([]);
  const { lines } = usePurchaseData();

  useEffect(() => {
    invoicesApi.list().then(setInvoices).catch(console.error);
  }, []);

  return (
    <section>
      <div className="card tbl">
        <table>
          <thead>
            <tr>
              <th>Invoice No</th>
              <th>Date</th>
              <th>PO Number</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv._id}>
                <td>{inv.invoiceNo || 'N/A'}</td>
                <td>{inv.invoiceDate || 'N/A'}</td>
                <td>{inv.po}</td>
                <td>{inv.status || 'Pending Verification'}</td>
                <td>
                  <button className="btn small" onClick={() => invoicesApi.blob(inv.po, { download: true })}>Download PDF</button>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan="5">No invoices found.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
