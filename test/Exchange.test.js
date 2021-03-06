require('chai')
  .use(require('chai-as-promised'))
  .should()

import { ether, tokens, EVM_REVERT, ETHER_ADDRESS } from './helpers'
import { invalid } from 'moment';
const Token = artifacts.require('./Token')
const Exchange = artifacts.require('./Exchange')

contract('Exchange', ([deployer, feeAccount, user1, user2]) => {
  let token
  let exchange
  const feePercent = 10

  beforeEach(async () => {
    token = await Token.new()
    exchange = await Exchange.new(feeAccount, feePercent)

    token.transfer(user1, tokens(100), { from: deployer })
  })

  describe('deployment', () => {
    it('tracts the fee account', async () => {
      const result = await exchange.feeAccount()
      result.should.equal(feeAccount)
    })

    it('tracts the fee percent', async () => {
      const result = await exchange.feePercent()
      result.toString().should.equal(feePercent.toString())
    })
  })

  describe('fallback', () => {
    it('reverts when Ether is sent directly', async () => {
      await exchange.sendTransaction({ value: 1, from: user1 })
        .should.be.rejectedWith(EVM_REVERT)
    })
  })

  describe('depositing Ether', () => {
    let result
    let amount

    beforeEach(async () => {
      amount = ether(1)
      result = await exchange.depositEther({ from: user1, value: amount })
    })

    it('tracts the Ether deposit', async() => {
      let balance = await exchange.tokens(ETHER_ADDRESS, user1)
      balance.toString().should.equal(amount.toString())
    })

    it('emits a Deposit event', async () => {
      const log = result.logs[0]
      log.event.should.eq('Deposit')
      const event = log.args
      event.token.toString().should.equal(ETHER_ADDRESS, 'from is correct')
      event.user.should.equal(user1, 'to is correct')
      event.amount.toString().should.equal(amount.toString(), 'value is correct')
      event.balance.toString().should.equal(amount.toString(), 'value is correct')
    })
  })

  describe('withdrawing Ether', () => {
    let amount
    let result

    beforeEach(async () => {
      amount = ether(1)
      result = await exchange.depositEther({ from: user1, value: amount })
    })

    describe('success', async () => {
      beforeEach(async () => {
        result = await exchange.withdrawEther(amount, { from: user1 })
      })

      it('withedraws Ether funds', async() => {
        const balance = await exchange.tokens(ETHER_ADDRESS, user1)
        balance.toString().should.equals('0')
      })

      it('emits a "Withdraw" event', async () => {
        const log = result.logs[0]
        log.event.should.eq('Withdraw')
        const event = log.args
        event.token.should.equal(ETHER_ADDRESS)
        event.user.should.equal(user1)
        event.amount.toString().should.equal(amount.toString())
        event.balance.toString().should.equal('0')
      })
    })

    describe('failure', async () => {
      it('rejects withdraws for insufficient balances', async () => {
        await exchange.withdrawEther(ether(2), { from: user1 })
          .should.be.rejectedWith(EVM_REVERT)
      })
    })
  })

  describe('depositing tokens', () => {
    let result
    let amount = tokens(10)

    describe('success', () => {
      beforeEach(async () => {
        await token.approve(exchange.address, amount, { from: user1 })
        result = await exchange.depositToken(token.address, amount, { from: user1 })
      })

      it('tracts the token deposit', async() => {
        let balance = await token.balanceOf(exchange.address)
        balance.toString().should.equal(amount.toString())

        balance = await exchange.tokens(token.address, user1)
        balance.toString().should.equal(amount.toString())
      })

      it('emits a Deposit event', async () => {
        const log = result.logs[0]
        log.event.should.eq('Deposit')
        const event = log.args
        event.token.toString().should.equal(token.address, 'from is correct')
        event.user.should.equal(user1, 'to is correct')
        event.amount.toString().should.equal(amount.toString(), 'value is correct')
        event.balance.toString().should.equal(amount.toString(), 'value is correct')
      })
    })

    describe('failure', () => {
      it('rejects Ether deposits', async() => {
        await exchange.depositToken(ETHER_ADDRESS, tokens(10), { from: user1 })
          .should.be.rejectedWith(EVM_REVERT)
      })

      it('fails when no tokens are approved', async() => {
        await exchange.depositToken(token.address, tokens(10), { from: user1 })
          .should.be.rejectedWith(EVM_REVERT)
      })
    })

  })

  describe('withdrawing tokens', async () => {
    let result
    let amount

    describe('success', async () => {
      beforeEach(async () => {
        // Deposit tokens first
        amount = tokens(10)
        await token.approve(exchange.address, amount, { from: user1 })
        await exchange.depositToken(token.address, amount, { from: user1 })

        // Withdraw tokens
        result = await exchange.withdrawToken(token.address, amount, { from: user1 })
      })

      it('withdraws token funds', async () => {
        const balance = await exchange.tokens(token.address, user1)
        balance.toString().should.equal('0')
      })

      it('emits a "Withdraw" event', async () => {
        const log = result.logs[0]
        log.event.should.eq('Withdraw')
        const event = log.args
        event.token.should.equal(token.address)
        event.user.should.equal(user1)
        event.amount.toString().should.equal(amount.toString())
        event.balance.toString().should.equal('0')
      })
    })

    describe('failure', async () => {
      it('rejects Ether withdraws', async () => {
        await exchange.withdrawToken(ETHER_ADDRESS, amount, { from: user1 }).should.be.rejectedWith(EVM_REVERT)
      })

      it('fails for insufficient balances', async () => {
        // Attempt to withdraw tokens without depositing any first
        await exchange.withdrawToken(token.address, amount, { from: user1 }).should.be.rejectedWith(EVM_REVERT)
      })
    })
  })

  describe('checking balances', async () => {
    let ethAmount

    beforeEach(async () => {
      ethAmount = ether(10)
      exchange.depositEther({ from: user1, value: ethAmount })
    })

    it('returns user balance', async () => {
      const result = await exchange.balanceOf(ETHER_ADDRESS, user1)
      result.toString().should.equal(ethAmount.toString())
    })
  })

  describe('making orders', async() => {
    let result
    let amountGet = tokens(1)
    let amountGive = ether(1)

    beforeEach(async () => {
      result = await exchange.makeOrder(token.address, amountGet, ETHER_ADDRESS, amountGive, { from: user1})
    })

    it('tracks the newly created order', async() => {
      const orderCount = await exchange.orderCount()
      orderCount.toString().should.equal('1')

      const order = await exchange.orders(1)

      order.id.toString().should.equal('1', 'id is correct')
      order.user.should.equal(user1, 'user is correct')
      order.tokenGet.toString().should.equal(token.address, 'tokenGet is correct')
      order.amountGet.toString().should.equal(amountGet.toString(), 'amountGet is correct')
      order.tokenGive.toString().should.equal(ETHER_ADDRESS, 'tokenGive is correct')
      order.amountGive.toString().should.equal(amountGive.toString(), 'amountGive is correct')
      order.timestamp.toString().length.should.be.at.least(1, 'timestamp is present')
    })

    it('emits a "Order" event', async () => {
      const log = result.logs[0]
      log.event.should.eq('Order')
      const event = log.args

      event.user.should.equal(user1, 'user is correct')
      event.tokenGet.toString().should.equal(token.address, 'tokenGet is correct')
      event.amountGet.toString().should.equal(amountGet.toString(), 'amountGet is correct')
      event.tokenGive.toString().should.equal(ETHER_ADDRESS, 'tokenGive is correct')
      event.amountGive.toString().should.equal(amountGive.toString(), 'amountGive is correct')
      event.timestamp.toString().length.should.be.at.least(1, 'timestamp is present')
    })
  })

  describe('order actions', async () => {
    beforeEach(async () => {
      // user1 deposits 1 Ether
      await exchange.depositEther({ from: user1, value: ether(1) })

      // give user2 100 Tokens
      await token.transfer(user2, tokens(100), { from: deployer })

      // user2 deposits 2 tokens
      // approve gives permission to the exchange address to move funds on user2's behalf
      await token.approve(exchange.address, tokens(2), { from: user2 })
      // depositToken actually moves the funds to the exchange user user2's allowance
      await exchange.depositToken(token.address, tokens(2), { from: user2 })

      // user1 trades 1 ETH for 1 Token
      await exchange.makeOrder(token.address, tokens(1), ETHER_ADDRESS, ether(1), { from: user1 })
    })

    describe('filling orders', async () => {
      let result

      describe('success', async () => {
        beforeEach(async () => {
          result = await exchange.fillOrder(1, { from: user2 })
        })

        it('executes the trade & charges fees', async() => {
          // user1 gets 1 token
          let balance = await exchange.balanceOf(token.address, user1)
          balance.toString().should.equal(tokens(1).toString(), 'user1 received tokens')
          // user1 deducted 1 ether
          balance = await exchange.balanceOf(ETHER_ADDRESS, user1)
          balance.toString().should.equal('0', 'user1 deducted 1 ether')

          // user2 gets 1 ether
          balance = await exchange.balanceOf(ETHER_ADDRESS, user2)
          balance.toString().should.equal(ether(1).toString(), 'user2 received ether')
          // user2 deducted 0.9 tokens
          balance = await exchange.balanceOf(token.address, user2)
          balance.toString().should.equal(tokens(0.9).toString(), 'user2 tokens deducted with fee applied')

          // feeAccount gets 0.1 tokens
          balance = await exchange.balanceOf(token.address, feeAccount)
          balance.toString().should.equal(tokens(0.1).toString(), 'feeAccount received fee')
        })

        it('updates filled orders', async () => {
          const orderFilled = await exchange.orderFilled(1)
          orderFilled.should.equal(true)
        })

        it('emits a Trade event', async () => {
          const log = result.logs[0]
          log.event.should.eq('Trade')
          const event = log.args

          event.id.toString().should.equal('1', 'id is correct')
          event.user.should.equal(user1, 'user is correct')
          event.tokenGet.should.equal(token.address, 'tokenGet is correct')
          event.amountGet.toString().should.equal(tokens(1).toString(), 'amountGet is correct')
          event.tokenGive.should.equal(ETHER_ADDRESS, 'tokenGive is correct')
          event.amountGive.toString().should.equal(ether(1).toString(), 'amountGive is correct')
          event.userFill.should.equal(user2, 'userFill is correct')
          event.timestamp.toString().length.should.be.at.least(1, 'timestamp is present')
        })
      })

      describe('failure', async () => {
        it('rejects invalid order ids', async () => {
          const invalidOrderId = 2
          await exchange.fillOrder(invalidOrderId, { from: user2 })
            .should.be.rejectedWith(EVM_REVERT)
        })

        it('rejects orders that have already been filled', async () => {
          await exchange.fillOrder(1, { from: user2 })
          await exchange.fillOrder(1, { from: user2 })
            .should.be.rejectedWith(EVM_REVERT)
        })

        it('rejects cancelled orders', async () => {
          await exchange.cancelOrder(1, { from: user1 })
          await exchange.fillOrder(1, { from: user2 })
            .should.be.rejectedWith(EVM_REVERT)
        })
      })
    })

    describe('cancelling orders', async () => {
      let result
      let amountGet = tokens(1)
      let amountGive = ether(1)

      beforeEach(async () => {
        result = await exchange.cancelOrder(1, { from: user1 })
      })

      it('updates cancelled orders', async () => {
        const orderCancelled = await exchange.orderCancelled(1)
        orderCancelled.should.equal(true)
      })

      it('emits a "Cancel" event', async () => {
        const log = result.logs[0]
        log.event.should.eq('Cancel')
        const event = log.args
  
        event.user.should.equal(user1, 'user is correct')
        event.tokenGet.toString().should.equal(token.address, 'tokenGet is correct')
        event.amountGet.toString().should.equal(amountGet.toString(), 'amountGet is correct')
        event.tokenGive.toString().should.equal(ETHER_ADDRESS, 'tokenGive is correct')
        event.amountGive.toString().should.equal(amountGive.toString(), 'amountGive is correct')
        event.timestamp.toString().length.should.be.at.least(1, 'timestamp is present')
      })

      describe('failure', async () => {
        it('rejects invalid order ids', async () => {
          const invalidOrderId = 9999
          await exchange.cancelOrder(invalidOrderId, { from: user1 })
            .should.be.rejectedWith(EVM_REVERT)
        })

        it('rejects unauthorized cancelations', async () => {
          await exchange.cancelOrder(1, { from: user2 })
            .should.be.rejectedWith(EVM_REVERT)
        })
      })
    })
  })
})
