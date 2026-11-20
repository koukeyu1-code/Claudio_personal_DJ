import { Router } from 'express'
import chatRoutes from './chat'
import playerRoutes from './player'
import tasteRoutes from './taste'
import musicRoutes from './music'

const router = Router()

router.use('/chat', chatRoutes)
router.use('/player', playerRoutes)
router.use('/taste', tasteRoutes)
router.use('/music', musicRoutes)

export default router
