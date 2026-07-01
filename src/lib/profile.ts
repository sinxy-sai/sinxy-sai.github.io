export const profile = {
  name: "sinxy-sai",
  displayName: "Sinxy Sai",
  role: "Computer science learner",
  location: "Beijing, China",
  email: "absz736824sx@outlook.com",
  github: "https://github.com/sinxy-sai",
  avatar: "/avatar.jpg",
  bio: "记录算法、计算机科学、前端工程和项目实践，把零散经验整理成以后还能复用的笔记。",
};

export const socialLinks = [
  {
    label: "Email",
    href: `mailto:${profile.email}`,
    value: profile.email,
    icon: "mail",
  },
  {
    label: "GitHub",
    href: profile.github,
    value: "github.com/sinxy-sai",
    icon: "github",
  },
] as const;
