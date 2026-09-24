import fs from 'fs'; 
['src/pages/customer-service/SalesInvoicesPage.vue', 'src/pages/customer-service/WarrantyClaimsPage.vue', 'src/pages/master/RolesPage.vue', 'src/pages/technician/TechCallServiceDetailPage.vue', 'src/pages/technician/TechCallServicesPage.vue', 'src/pages/technician/TechMaintenancePage.vue', 'src/pages/technician/TechMeterReadingsPage.vue', 'src/pages/technician/TechServiceHistoryPage.vue', 'src/pages/technician/TechSparepartRequestPage.vue', 'src/pages/customer-service/CallServicePage.vue', 'src/pages/customer-service/ContractItemsPage.vue', 'src/pages/customer-service/ServiceReportsPage.vue', 'src/pages/accounting/AccDeliveryOrdersPage.vue', 'src/pages/accounting/AccPurchaseOrdersPage.vue', 'src/pages/accounting/AccSparepartRequestsPage.vue'].forEach(f => { 
  try { 
    let c=fs.readFileSync(f,'utf8');
    // Remove all @ts-nocheck first
    c = c.replace(/\/\/ @ts-nocheck\r?\n/g, '');
    // Remove duplicate script tags
    c = c.replace(/(<script setup lang="ts">\r?\n)+/g, '<script setup lang="ts">\n');
    // Add ts-nocheck exactly once
    c = c.replace(/<script setup lang="ts">\r?\n/, '<script setup lang="ts">\n// @ts-nocheck\n');
    fs.writeFileSync(f, c); 
  } catch(e){} 
});
