context('VirtualInfiniteList', () => {
  beforeEach(() => {
    cy.visit('http://localhost:50212')
  })
  // https://on.cypress.io/interacting-with-elements

  it('[direction=top] can load virtual list', () => {
    cy.get('virtual-infinite-list-row').should(($dom) => {
      expect($dom).to.not.be.undefined
    })
  })

  it('[direction=top] load more data when scroll top', () => {
    cy.get('virtual-infinite-list-viewport')
      .scrollTo(0, -99999)
      .wait(500)
      .should(($div) => expect($div[0].scrollTop).not.to.equal('0'))
      .wait(500)
      .get('.load-count')
      .should(($div) => expect($div[0].innerText).to.equal('1'))
  })

  it('[direction=bottom] can load virtual list', () => {
    cy.get('#direction')
      .click()
      .wait(500)
      .get('virtual-infinite-list-row')
      .should(($dom) => {
        expect($dom).to.not.be.undefined
      })
  })

  it('[direction=bottom] load more data when scroll bottom', () => {
    cy.get('#direction')
      .click()
      .wait(500)
      .get('virtual-infinite-list-viewport')
      .scrollTo(0, 99999999)
      .wait(500)
      .get('.load-count')
      .should(($div) => expect($div[0].innerText).to.equal('3'))
  })
})
