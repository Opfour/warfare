// Unit orders system

export const ORDER = {
    ATTACK: 'attack',
    RETREAT: 'retreat',
    HOLD: 'hold',
    ADVANCE: 'advance',
    DIG_IN: 'dig_in',
    MOVE_TO: 'move_to',
};

// Set order on a unit
export function setOrder(unit, order) {
    unit.orders = order;
    // Clear move target if switching away from move_to
    if (order !== ORDER.MOVE_TO) {
        unit.moveTarget = null;
    }
}

// Set a move-to target on a unit
export function setMoveTarget(unit, q, r) {
    unit.orders = ORDER.MOVE_TO;
    unit.moveTarget = { q, r };
}

// Get defense multiplier based on current orders
export function getOrderDefenseBonus(unit) {
    switch (unit.orders) {
        case ORDER.DIG_IN: return 1.5;
        case ORDER.HOLD: return 1.2;
        case ORDER.RETREAT: return 0.7;
        default: return 1.0;
    }
}

// Get attack multiplier based on current orders
export function getOrderAttackBonus(unit) {
    switch (unit.orders) {
        case ORDER.ATTACK: return 1.2;
        case ORDER.ADVANCE: return 1.0;
        case ORDER.DIG_IN: return 0.8;
        default: return 1.0;
    }
}

// Check if unit should auto-respond to being attacked based on orders
export function willFightBack(unit) {
    if (unit.orders === ORDER.RETREAT) return false;
    return true;
}
