---
title: "第11章：DCP 暗通道先验去雾"
description: "整理 DCP 暗通道先验去雾算法的物理模型、透射率估计、大气光估计和算法流程。"
pubDate: 2026-06-30
tags: ["计算机视觉", "图像恢复", "DCP"]
---

本文整理自《第11章-图像的去雾恢复-2026.pdf》中“基于图像恢复的去雾算法”部分，重点讲解和推导 DCP（Dark Channel Prior，暗通道先验）算法。

## 1. DCP 要解决什么问题

雾天图像中，远处景物通常会出现：

- 对比度降低。
- 颜色发白、发灰。
- 细节变模糊。
- 远处目标和天空光混在一起。

DCP 的目标是：只给定一张有雾图像 $I(x)$，估计出无雾图像 $J(x)$。

这里 $x$ 表示像素位置，彩色图像有 RGB 三个通道，因此对每个颜色通道 $c\in\{R,G,B\}$ 都有对应的值：

$$
I^c(x),\quad J^c(x)
$$

其中：

- $I(x)$：输入的有雾图像。
- $J(x)$：希望恢复出的无雾图像。
- $c$：颜色通道。

## 2. 大气散射模型 ASM

DCP 建立在大气散射模型上。课件中的基本模型为：

$$
I(x)=J(x)t(x)+A(1-t(x))
$$

对每个颜色通道写成：

$$
I^c(x)=J^c(x)t(x)+A^c(1-t(x))
$$

其中：

- $I^c(x)$：有雾图像在位置 $x$、通道 $c$ 上的像素值。
- $J^c(x)$：无雾图像在位置 $x$、通道 $c$ 上的真实场景辐射。
- $A^c$：大气光，也叫天空光或全局环境光。
- $t(x)$：透射率，表示场景光线穿过雾气后还能到达相机的比例。

透射率通常写成：

$$
t(x)=e^{-\beta d(x)}
$$

其中：

- $\beta$：大气散射系数，雾越浓，$\beta$ 越大。
- $d(x)$：场景深度，目标离相机越远，$d(x)$ 越大。

因此：

- 近处目标：$d(x)$ 小，$t(x)$ 大，图像更接近真实场景 $J(x)$。
- 远处目标：$d(x)$ 大，$t(x)$ 小，图像更接近大气光 $A$。

## 3. 从 ASM 反解无雾图像

由

$$
I(x)=J(x)t(x)+A(1-t(x))
$$

展开右边：

$$
I(x)=J(x)t(x)+A-At(x)
$$

把 $A$ 移到左边：

$$
I(x)-A=t(x)(J(x)-A)
$$

两边除以 $t(x)$：

$$
J(x)-A=\frac{I(x)-A}{t(x)}
$$

所以

$$
J(x)=\frac{I(x)-A}{t(x)}+A
$$

课件中也写成等价形式：

$$
J(x)=A-\frac{A-I(x)}{t(x)}
$$

因此，图像去雾的核心问题变成：

1. 估计大气光 $A$。
2. 估计透射率 $t(x)$。

只要有了 $A$ 和 $t(x)$，就可以代回公式恢复 $J(x)$。

## 4. 暗通道先验是什么

DCP 的核心经验假设是：

> 在绝大多数非天空的无雾自然图像**局部区域**内，至少存在一些像素，它们在 RGB 某个通道上的强度非常低，接近 0。

形式化定义如下。对于无雾图像 $J$，其暗通道为：

$$
J^{dark}(x)=
\min_{y\in\Omega(x)}
\left(
\min_{c\in\{R,G,B\}}J^c(y)
\right)
$$

其中：

- $\Omega(x)$：以 $x$ 为中心的局部窗口，例如 $15\times 15$。
- $y$：窗口 $\Omega(x)$ 内的像素位置。
- $c$：RGB 通道。

这个定义做了两次最小值：

1. 对每个像素 $y$，先在 RGB 三个通道中取最小值：

$$
\min_{c\in\{R,G,B\}}J^c(y)
$$

2. 再在窗口 $\Omega(x)$ 内所有像素中取最小值：

$$
\min_{y\in\Omega(x)}
\left(
\min_{c\in\{R,G,B\}}J^c(y)
\right)
$$

暗通道先验认为，对大多数非天空区域：

$$
J^{dark}(x)\approx 0
$$

也就是：

$$
\min_{y\in\Omega(x)}
\left(
\min_{c\in\{R,G,B\}}J^c(y)
\right)
\approx 0
$$

直观原因是，局部区域里常常会出现阴影、深色物体，或者某个颜色通道反射率很低的彩色物体。例如：

- 绿色植物的红通道和蓝通道可能很低。
- 红色物体的绿通道或蓝通道可能很低。
- 建筑、石头、树干、阴影区域本身较暗。

所以在一个局部窗口内，总能找到某个像素的某个颜色通道接近 0。

## 5. 由暗通道先验推导透射率

从每个通道的大气散射模型开始：

$$
I^c(y)=J^c(y)t(y)+A^c(1-t(y))
$$

DCP 假设在一个小窗口 $\Omega(x)$ 内，透射率变化不大，可以近似为常数：

$$
t(y)\approx t(x),\quad y\in\Omega(x)
$$

于是对窗口内任意像素 $y$，有：

$$
I^c(y)=J^c(y)t(x)+A^c(1-t(x))
$$

两边同时除以 $A^c$。这里要求 $A^c>0$：

$$
\frac{I^c(y)}{A^c}
=
t(x)\frac{J^c(y)}{A^c}+
1-t(x)
$$

现在对窗口 $\Omega(x)$ 和颜色通道 $c$ 同时取最小值：

$$
\min_{y\in\Omega(x)}
\left(
\min_c
\frac{I^c(y)}{A^c}
\right)
=
\min_{y\in\Omega(x)}
\left(
\min_c
\left[
t(x)\frac{J^c(y)}{A^c}+
1-t(x)
\right]
\right)
$$

因为在窗口内 $t(x)$ 被看作常数，$1-t(x)$ 也是常数，可以从最小值操作中提出来：

$$
\min_{y\in\Omega(x)}
\left(
\min_c
\frac{I^c(y)}{A^c}
\right)
=
t(x)
\min_{y\in\Omega(x)}
\left(
\min_c
\frac{J^c(y)}{A^c}
\right)+
1-t(x)
$$

根据暗通道先验，无雾图像局部窗口内至少有一个颜色通道接近 0，所以：

$$
\min_{y\in\Omega(x)}
\left(
\min_c
\frac{J^c(y)}{A^c}
\right)
\approx 0
$$

代入上式：

$$
\min_{y\in\Omega(x)}
\left(
\min_c
\frac{I^c(y)}{A^c}
\right)
\approx
1-t(x)
$$

因此得到粗透射率估计：

$$
\tilde t(x)
=
1-
\min_{y\in\Omega(x)}
\left(
\min_c
\frac{I^c(y)}{A^c}
\right)
$$

这就是 DCP 透射率估计的核心公式。 

## 6. 为什么要加入 $\omega$

课件中给出的透射率估计公式带有一个参数 $\omega$：

$$
\tilde t(x)
=
1-\omega\,
\min_{y\in\Omega(x)}
\left(
\min_c
\frac{I^c(y)}{A^c}
\right)
$$

其中 $\omega$ 是雾的保留系数，通常取：

$$
\omega=0.95
$$

如果 $\omega=1$，表示尽可能完全去雾。实际中通常保留一点雾感，原因有两个：

1. 完全去掉雾可能让远景不自然，因为真实场景中远处本来就会受到空气散射影响。
2. 透射率估计不可能完全准确，过强去雾容易导致颜色过饱和、噪声放大和伪影。

所以使用 $\omega<1$，让恢复结果更稳定、更自然。

## 7. 透射率公式的直观解释

看这个公式：

$$
\tilde t(x)
=
1-\omega\,
\min_{y\in\Omega(x)}
\left(
\min_c
\frac{I^c(y)}{A^c}
\right)
$$

如果某个区域雾很浓，那么图像会更接近大气光 $A$，也就是：

$$
I^c(y)\approx A^c
$$

于是：

$$
\frac{I^c(y)}{A^c}\approx 1
$$

最小值也会偏大，因此：

$$
\tilde t(x)\approx 1-\omega
$$

透射率较小，说明该区域雾较浓、距离较远。

反过来，如果某个区域雾很少，局部暗通道中会出现很暗的值：

$$
\min_{y,c}\frac{I^c(y)}{A^c}\approx 0
$$

于是：

$$
\tilde t(x)\approx 1
$$

透射率较大，说明该区域受雾影响较小。

## 8. 大气光 $A$ 的估计

大气光 $A$ 不能简单取整幅图最亮的像素，因为白色物体、车灯、反光区域也可能很亮。

DCP 的估计方法是：

1. 先计算有雾图像 $I$ 的暗通道：

$$
I^{dark}(x)=
\min_{y\in\Omega(x)}
\left(
\min_c I^c(y)
\right)
$$

2. 在暗通道图 $I^{dark}$ 中，找出亮度最高的前 $0.1\%$ 像素位置。

3. 回到原始有雾图像 $I$，在这些候选位置中，选取原图亮度最高的像素作为大气光 $A$。

直观理解：

- 暗通道值很亮的位置，往往是雾很浓、接近天空光的远景区域。
- 在这些候选点里再选原图最亮的点，可以更可靠地估计大气光。

## 9. 由 $A$ 和 $t(x)$ 恢复无雾图像

有了大气光 $A$ 和透射率 $t(x)$ 后，直接使用 ASM 的反解：

$$
J(x)=\frac{I(x)-A}{t(x)}+A
$$

实际计算时，为了避免 $t(x)$ 太小导致除法爆炸，通常设置一个下限 $t_0$：

$$
J(x)=\frac{I(x)-A}{\max(t(x),t_0)}+A
$$

常见取值为：

$$
t_0=0.1
$$

为什么要限制 $t(x)$ 的下限？

如果 $t(x)$ 很小，例如接近 0，那么

$$
\frac{I(x)-A}{t(x)}
$$

会被放大很多，容易产生噪声、色彩失真和过强对比度。因此用 $\max(t(x),t_0)$ 保证数值稳定。

## 10. 透射率为什么需要细化

粗透射率

$$
\tilde t(x)
=
1-\omega\,
\min_{y\in\Omega(x)}
\left(
\min_c
\frac{I^c(y)}{A^c}
\right)
$$

来自局部窗口最小值操作。这个操作会带来几个问题：

- 透射率图会有块状效应。
- 物体边缘处容易不准确。
- 窗口跨越前景和背景时，会把不同深度区域混在一起。
- 后续恢复图像容易出现光晕。

因此 DCP 需要透射率细化。

课件中提到两类思路：

- 原始 DCP 使用软抠图（Soft Matting）优化透射率。
- 后续改进常用引导滤波（Guided Image Filtering, GIF）提高速度。

## 11. Soft Matting 细化透射率

ASM 形式：

$$
I(x)=J(x)t(x)+A(1-t(x))
$$

与图像抠图方程形式相似：

$$
I(x)=\alpha(x)F(x)+(1-\alpha(x))B(x)
$$

可以把透射率 $t(x)$ 类比为抠图中的 $\alpha(x)$：

$$
\alpha(x)\equiv t(x)
$$

因此可以借用闭式抠图的思想，让透射率在局部区域内既保持平滑，又尽量贴合图像边缘。

常见优化形式为：

$$
E(t)=t^TLt+\lambda(t-\tilde t)^T(t-\tilde t)
$$

其中：

- $t$：细化后的透射率。
- $\tilde t$：由暗通道估计得到的粗透射率。
- $L$：抠图拉普拉斯矩阵。
- $\lambda$：约束强度，控制细化结果对粗透射率的贴合程度。

最小化该目标函数，对 $t$ 求导：

$$
\frac{\partial E}{\partial t}
=2Lt+2\lambda(t-\tilde t)=0
$$

整理：

$$
Lt+\lambda t=\lambda\tilde t
$$

即

$$
(L+\lambda U)t=\lambda\tilde t
$$

其中 $U$ 是单位矩阵。因此

$$
t=\lambda(L+\lambda U)^{-1}\tilde t
$$

Soft Matting 效果较好，但需要解大型稀疏线性方程，计算成本较高。

## 12. Guided Filter 细化透射率

为了提高速度，后续常用引导滤波替代 Soft Matting。

引导滤波的基本假设是：在以像素 $k$ 为中心的局部窗口 $\omega_k$ 中，输出 $q$ 与引导图 $I$ 满足局部线性关系：

$$
q_i=a_kI_i+b_k,\quad i\in\omega_k
$$

在 DCP 中：

- 输入 $p$ 通常是粗透射率 $\tilde t$。
- 引导图 $I$ 通常是原始有雾图像或其灰度图。
- 输出 $q$ 是细化后的透射率 $t$。

为了让 $q$ 接近输入 $p$，同时避免 $a_k$ 过大，定义窗口内目标函数：

$$
E(a_k,b_k)=
\sum_{i\in\omega_k}
\left[
(a_kI_i+b_k-p_i)^2+\epsilon a_k^2
\right]
$$

这是一个线性岭回归问题。其解为：

$$
a_k=
\frac{
\frac{1}{|\omega|}\sum_{i\in\omega_k}I_ip_i-\mu_k\bar p_k
}{
\sigma_k^2+\epsilon
}
$$

$$
b_k=\bar p_k-a_k\mu_k
$$

其中：

- $\mu_k$：窗口 $\omega_k$ 内引导图 $I$ 的均值。
- $\sigma_k^2$：窗口 $\omega_k$ 内引导图 $I$ 的方差。
- $\bar p_k$：窗口 $\omega_k$ 内输入 $p$ 的均值。
- $\epsilon$：正则项，控制平滑程度。

一个像素 $i$ 会被多个窗口覆盖，因此最终输出取所有覆盖窗口结果的平均：

$$
q_i=\bar a_iI_i+\bar b_i
$$

其中：

$$
\bar a_i=\frac{1}{|\omega|}\sum_{k:i\in\omega_k}a_k
$$

$$
\bar b_i=\frac{1}{|\omega|}\sum_{k:i\in\omega_k}b_k
$$

引导滤波能够保边的原因是：输出 $q$ 与引导图 $I$ 局部线性相关，因此当 $I$ 中有明显边缘时，$q$ 的边缘也会被保留下来。用于 DCP 时，它可以让透射率边缘更贴合物体边界，减少光晕。

## 13. DCP 完整算法流程

DCP 的完整流程可以概括为：

1. 输入有雾图像 $I$。
2. 计算暗通道：

$$
I^{dark}(x)=
\min_{y\in\Omega(x)}
\left(
\min_c I^c(y)
\right)
$$

3. 根据暗通道估计大气光 $A$。
4. 计算粗透射率：

$$
\tilde t(x)
=
1-\omega\,
\min_{y\in\Omega(x)}
\left(
\min_c
\frac{I^c(y)}{A^c}
\right)
$$

5. 使用 Soft Matting 或 Guided Filter 细化透射率，得到 $t(x)$。
6. 设置透射率下限 $t_0$，恢复无雾图像：

$$
J(x)=\frac{I(x)-A}{\max(t(x),t_0)}+A
$$

## 14. DCP 的核心公式总结

暗通道定义：

$$
J^{dark}(x)=
\min_{y\in\Omega(x)}
\left(
\min_c J^c(y)
\right)
$$

暗通道先验：

$$
J^{dark}(x)\approx 0
$$

大气散射模型：

$$
I(x)=J(x)t(x)+A(1-t(x))
$$

粗透射率估计：

$$
\tilde t(x)
=
1-\omega\,
\min_{y\in\Omega(x)}
\left(
\min_c
\frac{I^c(y)}{A^c}
\right)
$$

无雾图像恢复：

$$
J(x)=\frac{I(x)-A}{\max(t(x),t_0)}+A
$$

## 15. DCP 的优点和局限

DCP 的优点：

- 不需要训练数据。
- 物理含义清晰。
- 对很多室外自然图像效果明显。
- 能同时估计透射率和恢复无雾图像。

DCP 的局限：

- 对天空区域不稳定，因为天空不满足暗通道接近 0 的先验。
- 对大面积白色、灰色、亮色物体容易误判为雾。
- 粗透射率由局部最小值产生，容易有块状效应。
- 透射率不准确时，边缘处容易出现光晕。
- Soft Matting 计算复杂度较高。
- 去雾过强时，图像容易变暗或颜色过饱和。

## 16. 一句话理解 DCP

DCP 的关键逻辑是：

> 无雾图像的局部区域通常有很暗的颜色通道；如果有雾后这些暗通道变亮了，那么变亮的程度就可以用来估计雾的浓度，也就是估计透射率 $t(x)$。

因此，DCP 用暗通道估计透射率，再结合大气散射模型反解无雾图像。
