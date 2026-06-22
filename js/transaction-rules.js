// ===================================================
// TransactionRules — shared filtering logic
// referenced by db.js, overview.jsx, reports.js, forecast.js
// ===================================================

window.TransactionRules = {
    isTransferLike(tx) {
        const cat = (tx.categories?.name) || '';
        return cat === 'Transfer between accounts' || tx.type === 'transfer';
    },

    isModifiedBalance(tx) {
        const cat = (tx.categories?.name) || '';
        return cat.startsWith('Modified Bal');
    },

    isHiddenFromSummary(tx) {
        const cat = (tx.categories?.name) || '';
        if (this.isModifiedBalance(tx)) return true;
        if (cat === 'Investment' || cat === 'Investment+' || cat === 'Investment-') return true;
        return false;
    },

    // Used by overview.jsx — excludes hidden entries; transfers shown only when showTransfers=true
    filterVisible(transactions, showTransfers) {
        return (transactions || []).filter(tx => {
            if (this.isModifiedBalance(tx)) return false;
            if (this.isHiddenFromSummary(tx)) return false;
            if (!showTransfers && this.isTransferLike(tx)) return false;
            return true;
        });
    },

    // Used by reports.js — always excludes transfers and non-financial entries
    filterFinancial(transactions) {
        return this.filterVisible(transactions, false);
    },
};
