const fs = require('fs');
const filePath = 'd:/hansenjonatann/project/freelance-project/biasapp/biasapp-frontend/biasappfe/src/pages/customer-service/ContractItemsPage.vue';
let content = fs.readFileSync(filePath, 'utf8');

const targetStr = `      <div class="form-row">
        <div class="form-group">
          <label for="ci-mono-rate" class="form-label">BW Rate/page</label>
          <input id="ci-mono-rate" v-model.number="form.rate_per_page_bw" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="ci-color-rate" class="form-label">Color Rate/page</label>
          <input id="ci-color-rate" v-model.number="form.rate_per_page_color" type="number" class="form-input" min="0">
        </div>
      </div>`;

const replaceStr = `      <div class="form-row">
        <div class="form-group">
          <label for="ci-mono-a4" class="form-label">BW Rate/page A4</label>
          <input id="ci-mono-a4" v-model.number="form.rate_per_page_bw_a4" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="ci-color-a4" class="form-label">Color Rate/page A4</label>
          <input id="ci-color-a4" v-model.number="form.rate_per_page_color_a4" type="number" class="form-input" min="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="ci-mono-a3" class="form-label">BW Rate/page A3</label>
          <input id="ci-mono-a3" v-model.number="form.rate_per_page_bw_a3" type="number" class="form-input" min="0">
        </div>
        <div class="form-group">
          <label for="ci-color-a3" class="form-label">Color Rate/page A3</label>
          <input id="ci-color-a3" v-model.number="form.rate_per_page_color_a3" type="number" class="form-input" min="0">
        </div>
      </div>`;

content = content.replace(targetStr, replaceStr);
fs.writeFileSync(filePath, content, 'utf8');
console.log("Replaced successfully!");
