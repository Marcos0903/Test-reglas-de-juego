export default {
  userSignup(event) {
    return {
      user: {
        ...event.user,
        appMetadata: {
          ...event.user.appMetadata,
          roles: ['member']
        }
      }
    };
  }
};

