import fs from 'fs'; 
['src/pages/customer-service/SalesInvoicesPage.vue', 'src/pages/customer-service/WarrantyClaimsPage.vue', 'src/pages/master/RolesPage.vue', 'src/pages/technician/TechCallServiceDetailPage.vue', 'src/pages/technician/TechCallServicesPage.vue', 'src/pages/technician/TechMaintenancePage.vue', 'src/pages/technician/TechMeterReadingsPage.vue', 'src/pages/technician/TechServiceHistoryPage.vue', 'src/pages/technician/TechSparepartRequestPage.vue'].forEach(f => { 
  try { 
    let c=fs.readFileSync(f,'utf8'); 
    c = c.replace(/<script setup lang="ts">\r?\n\/\/ @ts-nocheck\r?\n<script setup lang="ts">/g, '<script setup lang="ts">\n// @ts-nocheck'); 
    fs.writeFileSync(f, c); 
  } catch(e){} 
});
