#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env};

#[contract]
pub struct TicketContract;

#[contractimpl]
impl TicketContract {
    pub fn buy_ticket(env: Env, buyer: Address) {
        buyer.require_auth();

        env.storage().persistent().set(&buyer, &true);
        env.storage().persistent().extend_ttl(&buyer, 100, 518400);

        let init_key = soroban_sdk::symbol_short!("init");
        if !env.storage().instance().has(&init_key) {
            env.storage().instance().set(&init_key, &true);
        }
        env.storage().instance().extend_ttl(100, 518400);
    }

    pub fn has_ticket(env: Env, user: Address) -> bool {
        env.storage().persistent().get(&user).unwrap_or(false)
    }

    pub fn check_in(env: Env, admin: Address, user: Address) {
        admin.require_auth();

        let has_ticket = env
            .storage()
            .persistent()
            .get(&user)
            .unwrap_or(false);

        if !has_ticket {
            panic!("ticket not found");
        }

        env.storage().persistent().set(&user, &false);
        env.storage().persistent().extend_ttl(&user, 100, 518400);
        env.storage().instance().extend_ttl(100, 518400);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    #[test]
    fn starts_without_ticket() {
        let env = Env::default();
        let contract_id = env.register(TicketContract, ());
        let client = TicketContractClient::new(&env, &contract_id);
        let user = Address::generate(&env);

        assert!(!client.has_ticket(&user));
    }

    #[test]
    fn buyer_can_buy_ticket() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(TicketContract, ());
        let client = TicketContractClient::new(&env, &contract_id);
        let buyer = Address::generate(&env);

        client.buy_ticket(&buyer);

        assert!(client.has_ticket(&buyer));
    }

    #[test]
    fn ticket_is_bound_to_buyer_address() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(TicketContract, ());
        let client = TicketContractClient::new(&env, &contract_id);
        let buyer = Address::generate(&env);
        let other_user = Address::generate(&env);

        client.buy_ticket(&buyer);

        assert!(client.has_ticket(&buyer));
        assert!(!client.has_ticket(&other_user));
    }

    #[test]
    fn check_in_uses_ticket() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(TicketContract, ());
        let client = TicketContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);

        client.buy_ticket(&buyer);
        client.check_in(&admin, &buyer);

        assert!(!client.has_ticket(&buyer));
    }
}
